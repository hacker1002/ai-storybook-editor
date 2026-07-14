import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchSlice } from '../types';
import type { Sketch, SketchEntity, SketchSpread, SketchSpreadImage, SketchSpreadIllustration } from '@/types/sketch';
import type {
  SketchVariant,
  SketchEntityKind,
  SketchPageType,
  ArtDirection,
  SketchTextboxContent,
  SketchBase,
  SketchBaseSheet,
} from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';
import { isSketchTextboxContent, sheetOf } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchSlice');

/** Fresh empty base workspace (2 sheets: character + prop, no styles). */
function emptyBase(): SketchBase {
  return { character_sheet: { styles: [] }, prop_sheet: { styles: [] } };
}

export const DEFAULT_SKETCH: Sketch = {
  id: null,
  base: emptyBase(),
  characters: [],
  props: [],
  stages: [],
  spreads: [],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Old-shape markers (pre-3847f27 sketch JSONB). DB rows still hold the legacy shape
 * (no migration run yet) — if any marker is present we treat the blob as stale and
 * reset to DEFAULT_SKETCH (user decision Q4: "data sketch cũ thì replace về rỗng").
 */
function isLegacySketchShape(raw: Record<string, unknown>): boolean {
  if ('dummy_id' in raw || 'character_sheets' in raw || 'prop_sheets' in raw) return true;
  // Legacy spreads carried `images[]` and NO `pages[]`. The current shape ALSO carries
  // `images[]` (versioned backdrop, this migration) but always has `pages[]` too — so the
  // discriminator must require `images` WITHOUT `pages`, else every new spread false-positives
  // as legacy and gets reset to empty (data loss). See phase-01 HAZARD note.
  const spreads = raw.spreads;
  if (Array.isArray(spreads) && spreads.length > 0) {
    const first = spreads[0];
    if (isPlainObject(first) && 'images' in first && !('pages' in first)) return true;
  }
  return false;
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Coerce one raw variant → SketchVariant, filling the 3 required text fields when absent
 *  (backward-compat for blobs written before the 2026-07-13 restructure). Optional imagery
 *  (height / raw_sheet / crop / illustrations) is copied through by reference only when present. */
function coerceVariant(raw: unknown): SketchVariant {
  const r = isPlainObject(raw) ? raw : {};
  const v: SketchVariant = {
    key: asStr(r.key),
    description: asStr(r.description),
    visual_design: asStr(r.visual_design),
    art_language: asStr(r.art_language),
  };
  if (typeof r.height === 'string') v.height = r.height;
  if (isPlainObject(r.raw_sheet) && Array.isArray(r.raw_sheet.illustrations)) {
    v.raw_sheet = { illustrations: r.raw_sheet.illustrations as Illustration[] };
  }
  if (isPlainObject(r.crop) && Array.isArray(r.crop.illustrations)) {
    v.crop = { illustrations: r.crop.illustrations as Illustration[] };
  }
  if (Array.isArray(r.illustrations)) v.illustrations = r.illustrations as Illustration[];
  return v;
}

function coerceEntity(raw: unknown): SketchEntity {
  const r = isPlainObject(raw) ? raw : {};
  return {
    key: asStr(r.key),
    variants: Array.isArray(r.variants) ? r.variants.map(coerceVariant) : [],
  };
}

function asEntityArray(v: unknown): SketchEntity[] {
  return Array.isArray(v) ? v.map(coerceEntity) : [];
}

/** A raw sheet blob → SketchBaseSheet (styles array kept as-is; absent → empty). */
function normalizeSheet(raw: unknown): SketchBaseSheet {
  return isPlainObject(raw) && Array.isArray(raw.styles)
    ? { styles: raw.styles as SketchBaseSheet['styles'] }
    : { styles: [] };
}

/** Default the base workspace (2 empty sheets) when the blob predates the restructure. */
function normalizeBase(raw: unknown): SketchBase {
  if (!isPlainObject(raw)) return emptyBase();
  return {
    character_sheet: normalizeSheet(raw.character_sheet),
    prop_sheet: normalizeSheet(raw.prop_sheet),
  };
}

const VALID_PAGE_TYPES: readonly SketchPageType[] = ['left', 'right', 'full'];
function isValidPageType(v: unknown): v is SketchPageType {
  return typeof v === 'string' && (VALID_PAGE_TYPES as readonly string[]).includes(v);
}

/**
 * Back-compat per-spread normalizer for the PER-PAGE versioned `images[]` model (1..2 images,
 * keyed by unique page `type`):
 *  - already-new shape (`images` is an array) → ensure each element has a valid unique `type`,
 *    inferring from `pages` order for legacy single-backdrop rows that predate `type`; dedupe by
 *    type (keep first). NO length clamp — 'full' → 1, 'left'+'right' → 2.
 *  - legacy scalar `media_url: string` → wrap as ONE image with the first page's type.
 *  - no image at all → `images: []`.
 * `pages` / `textboxes` always default to []. Non-object rows collapse to an empty spread.
 */
export function normalizeSketchSpread(raw: unknown): SketchSpread {
  if (!isPlainObject(raw)) {
    return { id: '', images: [], pages: [], textboxes: [] };
  }
  const id = typeof raw.id === 'string' ? raw.id : '';
  const pages = Array.isArray(raw.pages) ? (raw.pages as SketchSpread['pages']) : [];
  const textboxes = Array.isArray(raw.textboxes) ? (raw.textboxes as SketchSpread['textboxes']) : [];

  // Ordered page types drive `type` inference for legacy images (single backdrop, no `type`).
  // Fall back to ['full'] when pages are absent so inference always has a target.
  const pageTypes = pages.map((p) => p?.type).filter(isValidPageType);
  const fallbackTypes: SketchPageType[] = pageTypes.length > 0 ? pageTypes : ['full'];

  let images: SketchSpreadImage[];
  if (Array.isArray(raw.images)) {
    const seen = new Set<SketchPageType>();
    const built: SketchSpreadImage[] = [];
    (raw.images as Array<Partial<SketchSpreadImage>>).forEach((img, i) => {
      const type: SketchPageType = isValidPageType(img?.type)
        ? img.type
        : fallbackTypes[i] ?? fallbackTypes[fallbackTypes.length - 1] ?? 'full';
      if (seen.has(type)) return; // dedupe by page type (keep first)
      seen.add(type);
      built.push({
        id: typeof img?.id === 'string' ? img.id : crypto.randomUUID(),
        type,
        illustrations: Array.isArray(img?.illustrations)
          ? (img.illustrations as SketchSpreadIllustration[])
          : [],
      });
    });
    images = built;
  } else if (typeof raw.media_url === 'string') {
    images = [
      {
        id: crypto.randomUUID(),
        type: fallbackTypes[0],
        illustrations: [
          { media_url: raw.media_url, created_time: new Date().toISOString(), is_selected: true },
        ],
      },
    ];
  } else {
    images = [];
  }

  return { id, images, pages, textboxes };
}

/**
 * Normalize a raw `snapshots.sketch` JSONB blob into the canonical Sketch shape.
 * - non-object / undefined / null → DEFAULT_SKETCH
 * - legacy shape (markers above) → DEFAULT_SKETCH (intentional reset; round-trip will
 *   overwrite the stale DB blob with empty on next save)
 * - new shape → mapped defensively (missing nested arrays default to [])
 */
export function normalizeSketch(raw: unknown): Sketch {
  if (!isPlainObject(raw)) return DEFAULT_SKETCH;
  if (isLegacySketchShape(raw)) {
    // debug (not warn): every existing book still holds the legacy shape (no DB
    // migration run yet), so reset-to-empty is the EXPECTED path, not a fallback.
    log.debug('normalizeSketch', 'legacy sketch shape → reset to empty', {
      keys: Object.keys(raw).slice(0, 8),
    });
    return DEFAULT_SKETCH;
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    base: normalizeBase(raw.base),
    characters: asEntityArray(raw.characters),
    props: asEntityArray(raw.props),
    stages: asEntityArray(raw.stages),
    spreads: Array.isArray(raw.spreads) ? raw.spreads.map(normalizeSketchSpread) : [],
  };
}

// Slice: state + setSketch/clearSketch + entity-level CRUD (keyed by `kind`).
// Spread/textbox/art-direction CRUD remain deferred (ship with sketch-spread space).
// Every mutation sets `sync.isDirty` so auto-save flushes sketch edits/imports.
export const createSketchSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchSlice
> = (set) => ({
  sketch: DEFAULT_SKETCH,

  setSketch: (sketch) =>
    set((state) => {
      log.debug('setSketch', 'replace', {
        characters: sketch.characters.length,
        props: sketch.props.length,
        stages: sketch.stages.length,
        spreads: sketch.spreads.length,
      });
      state.sketch = sketch;
      state.sync.isDirty = true;
    }),

  clearSketch: () =>
    set((state) => {
      log.debug('clearSketch', 'reset to empty');
      state.sketch = DEFAULT_SKETCH;
      state.sync.isDirty = true;
    }),

  // --- Entity-level CRUD (keyed by kind) ---

  setSketchEntities: (kind: SketchEntityKind, entities: SketchEntity[]) =>
    set((state) => {
      log.debug('setSketchEntities', 'replace all', { kind, count: entities.length });
      state.sketch[kind] = entities;
      state.sync.isDirty = true;
    }),

  upsertSketchEntity: (kind: SketchEntityKind, entity: SketchEntity) =>
    set((state) => {
      const list = state.sketch[kind];
      const idx = list.findIndex((e) => e.key === entity.key);
      log.debug('upsertSketchEntity', idx === -1 ? 'add' : 'update', { kind, key: entity.key });
      if (idx === -1) list.push(entity);
      else list[idx] = entity;
      state.sync.isDirty = true;
    }),

  removeSketchEntity: (kind: SketchEntityKind, key: string) =>
    set((state) => {
      log.debug('removeSketchEntity', 'remove', { kind, key });
      state.sketch[kind] = state.sketch[kind].filter((e) => e.key !== key);
      state.sync.isDirty = true;
    }),

  upsertSketchVariant: (kind: SketchEntityKind, entityKey: string, variant: SketchVariant) =>
    set((state) => {
      const entity = state.sketch[kind].find((e) => e.key === entityKey);
      if (entity) {
        const idx = entity.variants.findIndex((v) => v.key === variant.key);
        log.debug('upsertSketchVariant', idx === -1 ? 'add' : 'update', {
          kind,
          entityKey,
          variantKey: variant.key,
        });
        if (idx === -1) entity.variants.push(variant);
        else entity.variants[idx] = variant;
        state.sync.isDirty = true;
      }
    }),

  // --- Entity/variant text + per-variant imagery ---

  updateSketchVariantText: (kind, key, variantKey, updates) =>
    set((state) => {
      const variant = state.sketch[kind]
        .find((e) => e.key === key)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('updateSketchVariantText', 'merge', { kind, key, variantKey, keys: Object.keys(updates) });
      if (updates.description !== undefined) variant.description = updates.description;
      if (updates.height !== undefined) variant.height = updates.height;
      if (updates.visual_design !== undefined) variant.visual_design = updates.visual_design;
      if (updates.art_language !== undefined) variant.art_language = updates.art_language;
      state.sync.isDirty = true;
    }),

  setSketchVariantRawSheetIllustrations: (kind, entityKey, variantKey, illustrations) =>
    set((state) => {
      const variant = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchVariantRawSheetIllustrations', 'set', { kind, entityKey, variantKey, count: illustrations.length });
      variant.raw_sheet = { illustrations };
      state.sync.isDirty = true;
    }),

  setSketchVariantCropIllustrations: (kind, entityKey, variantKey, illustrations) =>
    set((state) => {
      const variant = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchVariantCropIllustrations', 'set', { kind, entityKey, variantKey, count: illustrations.length });
      variant.crop = { illustrations };
      state.sync.isDirty = true;
    }),

  setSketchVariantIllustrations: (kind, entityKey, variantKey, illustrations) =>
    set((state) => {
      const variant = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchVariantIllustrations', 'set', { kind, entityKey, variantKey, count: illustrations.length });
      variant.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  // --- Base workspace (char + prop sheets) — pure setters ---

  setSketchBaseEntities: ({ characters, props }) =>
    set((state) => {
      log.debug('setSketchBaseEntities', 'bulk import', { characters: characters.length, props: props.length });
      state.sketch.characters = characters;
      state.sketch.props = props;
      state.sync.isDirty = true;
    }),

  addSketchBaseStyle: (kind, style) =>
    set((state) => {
      log.debug('addSketchBaseStyle', 'append', { kind });
      sheetOf(state.sketch.base, kind).styles.push(style);
      state.sync.isDirty = true;
    }),

  removeSketchBaseStyle: (kind, styleIndex) =>
    set((state) => {
      const styles = sheetOf(state.sketch.base, kind).styles;
      if (styleIndex < 0 || styleIndex >= styles.length) return;
      log.debug('removeSketchBaseStyle', 'remove', { kind, styleIndex });
      styles.splice(styleIndex, 1);
      state.sync.isDirty = true;
    }),

  // 🔒 LOCK: exclusive is_selected within the sheet + CLONE the locked style's crops into
  // every base entity's variants[base].crop (Illustration is flat → per-element spread = deep clone).
  setSketchBaseStyleSelected: (kind, styleIndex) =>
    set((state) => {
      const styles = sheetOf(state.sketch.base, kind).styles;
      if (styleIndex < 0 || styleIndex >= styles.length) return;
      log.debug('setSketchBaseStyleSelected', 'lock style + clone crops', { kind, styleIndex });
      styles.forEach((s, j) => {
        s.is_selected = j === styleIndex;
      });
      const crops = styles[styleIndex].crops;
      for (const entity of state.sketch[kind]) {
        const base = entity.variants.find((v) => v.key === 'base');
        if (!base) continue;
        const c = crops.find((cr) => cr.key === entity.key);
        if (c) base.crop = { illustrations: c.illustrations.map((ill) => ({ ...ill })) };
      }
      state.sync.isDirty = true;
    }),

  addSketchBaseStyleIllustration: (kind, styleIndex, mediaUrl) =>
    set((state) => {
      const style = sheetOf(state.sketch.base, kind).styles[styleIndex];
      if (!style) return;
      log.debug('addSketchBaseStyleIllustration', 'prepend created', { kind, styleIndex });
      style.illustrations.forEach((x) => {
        x.is_selected = false;
      });
      style.illustrations.unshift({
        type: 'created',
        media_url: mediaUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      });
      state.sync.isDirty = true;
    }),

  setSketchBaseStyleIllustrations: (kind, styleIndex, illustrations) =>
    set((state) => {
      const style = sheetOf(state.sketch.base, kind).styles[styleIndex];
      if (!style) return;
      log.debug('setSketchBaseStyleIllustrations', 'replace set', { kind, styleIndex, count: illustrations.length });
      style.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  setSketchBaseStyleCrops: (kind, styleIndex, crops) =>
    set((state) => {
      const style = sheetOf(state.sketch.base, kind).styles[styleIndex];
      if (!style) return;
      log.debug('setSketchBaseStyleCrops', 'replace crops', { kind, styleIndex, count: crops.length });
      style.crops = crops;
      state.sync.isDirty = true;
    }),

  setSketchBaseCropIllustrations: (kind, styleIndex, entityKey, illustrations) =>
    set((state) => {
      const crop = sheetOf(state.sketch.base, kind).styles[styleIndex]?.crops.find((c) => c.key === entityKey);
      if (!crop) return;
      log.debug('setSketchBaseCropIllustrations', 'replace crop set', { kind, styleIndex, entityKey, count: illustrations.length });
      crop.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  setSketchBaseStyleImageReferences: (kind, styleIndex, refs) =>
    set((state) => {
      const style = sheetOf(state.sketch.base, kind).styles[styleIndex];
      if (!style) return;
      log.debug('setSketchBaseStyleImageReferences', 'set', { kind, styleIndex, count: refs.length });
      style.image_references = refs;
      state.sync.isDirty = true;
    }),

  updateSketchBaseEntityText: (kind, entityKey, updates) =>
    set((state) => {
      const base = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === 'base');
      if (!base) return;
      log.debug('updateSketchBaseEntityText', 'merge', { kind, entityKey, keys: Object.keys(updates) });
      if (updates.description !== undefined) base.description = updates.description;
      if (updates.height !== undefined) base.height = updates.height;
      if (updates.visual_design !== undefined) base.visual_design = updates.visual_design;
      if (updates.art_language !== undefined) base.art_language = updates.art_language;
      state.sync.isDirty = true;
    }),

  // --- Spread-level CRUD (ships with the sketch-spread creative space) ---

  setSketchSpreads: (spreads: SketchSpread[]) =>
    set((state) => {
      log.debug('setSketchSpreads', 'replace all', { count: spreads.length });
      state.sketch.spreads = spreads;
      state.sync.isDirty = true;
    }),

  addSketchSpread: (spread: SketchSpread) =>
    set((state) => {
      log.debug('addSketchSpread', 'push', { id: spread.id });
      state.sketch.spreads.push(spread);
      state.sync.isDirty = true;
    }),

  deleteSketchSpread: (id: string) =>
    set((state) => {
      log.debug('deleteSketchSpread', 'remove', { id });
      state.sketch.spreads = state.sketch.spreads.filter((s) => s.id !== id);
      state.sync.isDirty = true;
    }),

  // Index-based move with clamp; from==to (or empty) is a no-op (leaves isDirty untouched).
  reorderSketchSpreads: (from: number, to: number) =>
    set((state) => {
      const list = state.sketch.spreads;
      const len = list.length;
      if (len === 0) return;
      const f = Math.max(0, Math.min(from, len - 1));
      const t = Math.max(0, Math.min(to, len - 1));
      if (f === t) return;
      log.debug('reorderSketchSpreads', 'move', { from: f, to: t });
      const [moved] = list.splice(f, 1);
      list.splice(t, 0, moved);
      state.sync.isDirty = true;
    }),

  // Prepend a new generated version onto the spread's PER-PAGE image (keyed by page `type`),
  // auto-select it, and clear the previous selection. Creates that page's image container on
  // first generate for the page. Marks dirty so the awaited flushSnapshot() in the spread-generate
  // job persists it before the next page/spread reads it back for consistency.
  addSketchSpreadImageVersion: (spreadId: string, pageType: SketchPageType, mediaUrl: string) =>
    set((state) => {
      const spread = state.sketch.spreads.find((s) => s.id === spreadId);
      if (!spread) return;
      let img = spread.images.find((im) => im.type === pageType);
      if (!img) {
        log.debug('addSketchSpreadImageVersion', 'create page image', { spreadId, pageType });
        spread.images.push({ id: crypto.randomUUID(), type: pageType, illustrations: [] });
        img = spread.images[spread.images.length - 1]; // re-read as immer draft proxy
      }
      img.illustrations.forEach((ill) => {
        ill.is_selected = false;
      });
      img.illustrations.unshift({
        media_url: mediaUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      });
      log.info('addSketchSpreadImageVersion', 'prepend version', { spreadId, pageType });
      state.sync.isDirty = true;
    }),

  // Re-select an EXISTING version of the spread's per-page image by media_url (clears the prior
  // selection). Mirrors addSketchSpreadImageVersion's selection semantics WITHOUT prepending —
  // used when the Edit modal re-picks an older variant (caller-owns-write). Marks dirty so the
  // effective url change persists.
  selectSketchSpreadImageVersion: (spreadId: string, pageType: SketchPageType, mediaUrl: string) =>
    set((state) => {
      const spread = state.sketch.spreads.find((s) => s.id === spreadId);
      if (!spread) return;
      const img = spread.images.find((im) => im.type === pageType);
      if (!img) {
        log.debug('selectSketchSpreadImageVersion', 'no page image', { spreadId, pageType });
        return;
      }
      const target = img.illustrations.find((ill) => ill.media_url === mediaUrl);
      if (!target || target.is_selected) return; // unknown url or already selected → no-op
      img.illustrations.forEach((ill) => {
        ill.is_selected = ill.media_url === mediaUrl;
      });
      log.info('selectSketchSpreadImageVersion', 'select version', { spreadId, pageType });
      state.sync.isDirty = true;
    }),

  // Art-direction identity = page `type` ('left'|'right'|'full'); merges a partial patch.
  updateSketchPageArtDirection: (
    spreadId: string,
    pageType: SketchPageType,
    patch: Partial<ArtDirection>,
  ) =>
    set((state) => {
      const spread = state.sketch.spreads.find((s) => s.id === spreadId);
      const page = spread?.pages.find((p) => p.type === pageType);
      if (page) {
        log.debug('updateSketchPageArtDirection', 'merge', {
          spreadId,
          pageType,
          keys: Object.keys(patch),
        });
        page.art_direction = { ...page.art_direction, ...patch };
        state.sync.isDirty = true;
      }
    }),

  // Per-language content upsert. The shared canvas synthesizes a full content object for a
  // requested language and emits it expecting the store to PERSIST it (create-on-first-edit),
  // so an absent language entry must be created — not skipped. Only the literal `id` slot
  // (never a content object) is protected. `patch` from the canvas is always full content.
  updateSketchTextbox: (
    spreadId: string,
    textboxId: string,
    languageKey: string,
    patch: Partial<SketchTextboxContent>,
  ) =>
    set((state) => {
      if (languageKey === 'id') return; // never overwrite the id key
      const spread = state.sketch.spreads.find((s) => s.id === spreadId);
      const textbox = spread?.textboxes.find((t) => t.id === textboxId);
      if (!textbox) return;
      const entry = textbox[languageKey];
      const base = isSketchTextboxContent(entry) ? entry : undefined;
      log.debug('updateSketchTextbox', base ? 'merge' : 'create', {
        spreadId,
        textboxId,
        languageKey,
        keys: Object.keys(patch),
      });
      textbox[languageKey] = { ...(base ?? {}), ...patch } as SketchTextboxContent;
      state.sync.isDirty = true;
    }),

  deleteSketchTextbox: (spreadId: string, textboxId: string) =>
    set((state) => {
      const spread = state.sketch.spreads.find((s) => s.id === spreadId);
      if (!spread) return;
      log.debug('deleteSketchTextbox', 'remove', { spreadId, textboxId });
      spread.textboxes = spread.textboxes.filter((t) => t.id !== textboxId);
      state.sync.isDirty = true;
    }),
});
