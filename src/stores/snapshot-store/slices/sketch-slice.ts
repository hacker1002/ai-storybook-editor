import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchSlice } from '../types';
import type { Sketch, SketchEntity, SketchSpread, SketchSpreadImage, SketchSpreadIllustration } from '@/types/sketch';
import type {
  SketchVariant,
  SketchVariantCrop,
  SketchEntityKind,
  SketchPageType,
  ArtDirection,
  SketchTextboxContent,
  SketchBase,
  SketchBaseSheet,
  SketchBaseStyle,
} from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';
import { isSketchTextboxContent, sheetOf } from '@/types/sketch';
import { createLogger } from '@/utils/logger';
import { parseHeightCm } from '@/utils/parse-height-cm';

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
 * Reports an unexpected-shape finding hit while normalizing a raw sketch blob.
 *
 * The normalizer stays PURE — it never imports a toast/UI module. It hands every anomaly to the
 * caller (`snapshot-store/index.ts`), which aggregates them into ONE user-facing toast per load.
 */
export type SketchAnomalyReporter = (anomaly: string) => void;

const noopAnomalyReporter: SketchAnomalyReporter = () => {};

/**
 * Stale top-level keys from the pre-3847f27 sketch JSONB.
 *
 * They are NOT part of the `Sketch` type, so they are dropped from the in-memory model and will not
 * survive the next whole-node save — hence they are REPORTED (toast) rather than dropped silently.
 * They no longer trigger any kind of reset. See the DATA-SAFETY note on `normalizeSketch`.
 */
const LEGACY_SKETCH_KEYS = ['dummy_id', 'character_sheets', 'prop_sheets'] as const;

const typeNameOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Coerce one raw variant-crop blob → SketchVariantCrop (positional cell; is_selected defaults
 *  to false, illustrations to []). */
function coerceVariantCrop(raw: unknown): SketchVariantCrop {
  const r = isPlainObject(raw) ? raw : {};
  return {
    is_selected: Boolean(r.is_selected),
    illustrations: Array.isArray(r.illustrations) ? (r.illustrations as Illustration[]) : [],
  };
}

/** Coerce one raw variant → SketchVariant, filling the 3 required text fields when absent
 *  (backward-compat for blobs written before the 2026-07-13 restructure). raw_sheet parses the
 *  new `{ illustrations[], crops[] }` model; the legacy single `crop` blob (pre-2026-07-14) is
 *  mapped LOSSLESSLY into `crops[0]` (is_selected=true). Stage `illustrations[]` copied through
 *  when present. */
function coerceVariant(raw: unknown): SketchVariant {
  const r = isPlainObject(raw) ? raw : {};
  const v: SketchVariant = {
    key: asStr(r.key),
    description: asStr(r.description),
    visual_design: asStr(r.visual_design),
    art_language: asStr(r.art_language),
  };
  // MIGRATE (read-time, 2026-07-17): height went string → number|null (cm). Every load/merge runs
  // through here, so a legacy string blob ("~110cm") self-parses to 110; an already-number value is
  // idempotent; an unparseable one becomes null (the variant itself is never dropped). No DB
  // migration needed. Presence-gated: a variant with NO height field keeps none (stage variants have
  // no height at all — writing `height: null` onto every one of them would churn the blob).
  if ('height' in r) v.height = parseHeightCm(r.height);
  // Legacy single-cell crop (pre-2026-07-14) → mapped into crops[0] below.
  const legacyCropIllustrations =
    isPlainObject(r.crop) && Array.isArray(r.crop.illustrations)
      ? (r.crop.illustrations as Illustration[])
      : null;
  if (isPlainObject(r.raw_sheet)) {
    const illustrations = Array.isArray(r.raw_sheet.illustrations)
      ? (r.raw_sheet.illustrations as Illustration[])
      : [];
    let crops: SketchVariantCrop[];
    if (Array.isArray(r.raw_sheet.crops)) {
      crops = r.raw_sheet.crops.map(coerceVariantCrop); // new positional model
    } else if (legacyCropIllustrations) {
      crops = [{ is_selected: true, illustrations: legacyCropIllustrations }]; // BACK-COMPAT
    } else {
      crops = [];
    }
    v.raw_sheet = { illustrations, crops };
  } else if (legacyCropIllustrations) {
    // Legacy blob carrying only `crop` (no raw_sheet).
    v.raw_sheet = { illustrations: [], crops: [{ is_selected: true, illustrations: legacyCropIllustrations }] };
  }
  if (Array.isArray(r.illustrations)) v.illustrations = r.illustrations as Illustration[]; // stage
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

/** The three entity collections under `sketch` — the only sub-trees that carry variants. */
const ENTITY_KINDS: readonly string[] = ['characters', 'props', 'stages'] satisfies SketchEntityKind[];

/**
 * MERGE-BOUNDARY coercer for the realtime content-sync path (column `sketch`).
 *
 * `normalizeSketch` only runs on a full snapshot load, but a peer's sync event refetches a
 * SUB-NODE straight from DB jsonb and merges it verbatim (`applyRemoteNodePatch` /
 * `reconcileCollectionByIds`). Without this, a legacy `height: "~110cm"` string re-enters a
 * `number | null` field (the 2026-07-17 migration is read-time only — no DB backfill), so the
 * type is a lie for any variant not re-saved since. Coercing at the fetch closes all three
 * scopes (node / collection / set) in one place.
 *
 * Addressed by the server's positional path (`resolve_snapshot_path`):
 *   ['characters']        → the whole entity array   (set + collection scope)
 *   ['characters','2']    → one entity node          (node scope, rtype 3/4)
 * Anything else (`['spreads', …]`, `['base', …]`) passes through untouched — variants are never
 * addressed individually (entities are always saved as a whole composite node), so there is no
 * deeper case to handle. `null`/`undefined` pass through so the remove semantics survive.
 * Idempotent + cheap: it re-runs on every merge, and `parseHeightCm(110) === 110`.
 */
export function coerceSketchNode(path: string[], value: unknown): unknown {
  if (value == null) return value; // null → remove; undefined → rpc error (caller skips)
  if (!ENTITY_KINDS.includes(path[0])) return value;
  if (path.length === 1) return asEntityArray(value);
  if (path.length === 2) return coerceEntity(value);
  return value;
}

/** Coerce one salvaged raw style blob → SketchBaseStyle, defaulting its 3 array fields.
 *  Mirrors `coerceEntity`'s philosophy: never trust a recovered element's inner shape. Without
 *  this, a salvaged non-style element reaches `styles[i].crops.find(...)` / `.illustrations
 *  .forEach(...)` in the base-workspace actions below and throws. Only used on the SALVAGE paths —
 *  a well-formed `styles` array is passed through untouched. */
function coerceStyle(raw: unknown): SketchBaseStyle {
  const r = isPlainObject(raw) ? raw : {};
  return {
    style_prompt: asStr(r.style_prompt),
    is_selected: Boolean(r.is_selected),
    image_references: Array.isArray(r.image_references)
      ? (r.image_references as SketchBaseStyle['image_references'])
      : [],
    illustrations: Array.isArray(r.illustrations) ? (r.illustrations as Illustration[]) : [],
    crops: Array.isArray(r.crops) ? (r.crops as SketchBaseStyle['crops']) : [],
  };
}

/**
 * A raw sheet blob → SketchBaseSheet.
 *
 * DATA-SAFETY (2026-07-17): this used to collapse to `{ styles: [] }` for ANY shape it did not
 * recognise, silently destroying every style the user had created. It now distinguishes:
 *  - ABSENT (null/undefined) → `{ styles: [] }`. A book with no sheet yet — legitimate, NOT an
 *    anomaly, so it must NOT toast (crying wolf on every new book trains users to ignore the
 *    real warning).
 *  - VALID (`styles` is an array) → passed through untouched.
 *  - MALFORMED → reported, and anything salvageable is recovered (element-coerced so a recovered
 *    style can never crash the base workspace).
 *
 * NOTE: only the `styles` key is carried — `SketchBaseSheet` has no other field (types/sketch.ts),
 * so an unknown sibling key IS dropped here (silently: it is unreadable by any current code).
 */
function normalizeSheet(raw: unknown, path: string, onAnomaly: SketchAnomalyReporter): SketchBaseSheet {
  if (raw == null) return { styles: [] }; // legitimately new — no anomaly

  // A bare array parked in the sheet slot is almost certainly the styles[] itself → salvage it
  // rather than throw the user's styles away.
  if (Array.isArray(raw)) {
    onAnomaly(`${path} là array thay vì object (đã giữ nguyên ${raw.length} style)`);
    return { styles: raw.map(coerceStyle) };
  }

  if (!isPlainObject(raw)) {
    onAnomaly(`${path} có kiểu "${typeNameOf(raw)}" thay vì object`);
    return { styles: [] };
  }

  const styles = raw.styles;
  if (Array.isArray(styles)) return { styles: styles as SketchBaseSheet['styles'] }; // keep as-is
  if (styles == null) return { styles: [] }; // sheet exists but has no style yet — legitimate

  // An object-map of styles (`{"0":{…},"1":{…}}`) is a REAL risk here, not a hypothetical: sketch
  // subtrees are written positionally through the collab gateway (`resolve_snapshot_path`), and a
  // positional jsonb_set write onto a missing/'{}' path leaves exactly this shape. Recover it
  // (ordered by V8's integer-key ascending iteration) instead of blanking the user's styles.
  if (isPlainObject(styles)) {
    const values = Object.values(styles);
    if (values.length > 0 && values.every(isPlainObject)) {
      onAnomaly(`${path}.styles là object-map thay vì array (đã giữ nguyên ${values.length} style)`);
      return { styles: values.map(coerceStyle) };
    }
  }

  // `styles` holds something that cannot be represented as a style array. There is nothing to
  // preserve in-type, so report it loudly: the toast is what stops the user from editing on top of
  // a bad read and persisting the result.
  onAnomaly(`${path}.styles có kiểu "${typeNameOf(styles)}" thay vì array`);
  return { styles: [] };
}

/** The base workspace (2 sheets). Absent → 2 empty sheets (new book); malformed → reported. */
function normalizeBase(raw: unknown, onAnomaly: SketchAnomalyReporter): SketchBase {
  if (raw == null) return emptyBase(); // legitimately new — no anomaly
  if (!isPlainObject(raw)) {
    onAnomaly(`base có kiểu "${typeNameOf(raw)}" thay vì object`);
    return emptyBase();
  }
  return {
    character_sheet: normalizeSheet(raw.character_sheet, 'base.character_sheet', onAnomaly),
    prop_sheet: normalizeSheet(raw.prop_sheet, 'base.prop_sheet', onAnomaly),
  };
}

/** One entity collection (`characters`/`props`/`stages`). Absent → []; malformed → reported. */
function entityArrayAt(
  raw: Record<string, unknown>,
  key: string,
  onAnomaly: SketchAnomalyReporter,
): SketchEntity[] {
  const v = raw[key];
  if (v == null) return []; // legitimately new — no anomaly
  if (!Array.isArray(v)) {
    onAnomaly(`${key} có kiểu "${typeNameOf(v)}" thay vì array`);
    return [];
  }
  return v.map(coerceEntity);
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
 * `pages` / `textboxes` always default to []. Non-object rows keep their (empty) slot and are
 * REPORTED — a spreads[] element is never legitimately a non-object, so it must not pass silently.
 */
export function normalizeSketchSpread(
  raw: unknown,
  onAnomaly: SketchAnomalyReporter = noopAnomalyReporter,
): SketchSpread {
  if (!isPlainObject(raw)) {
    // Nothing salvageable, but keep the slot so the remaining spreads stay positionally correct.
    onAnomaly(`spreads[] có phần tử kiểu "${typeNameOf(raw)}" thay vì object`);
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
 *
 * DATA-SAFETY CONTRACT (rewritten 2026-07-17 after real production data loss — see below):
 * **An unexpected shape NEVER silently replaces existing data with empty.** Empty is only ever
 * returned when the source is genuinely ABSENT (null/undefined = a book with no sketch yet).
 * Anything else that looks wrong is mapped as defensively as possible and REPORTED via
 * `onAnomaly`, which the caller surfaces as a toast so a human decides what to do.
 *
 * What went wrong: a removed `isLegacySketchShape()` helper judged the WHOLE blob from
 * `spreads[0]` (`'images' in first && !('pages' in first)`) plus a few stale top-level keys, and
 * returned DEFAULT_SKETCH on a match — wiping `base.*.styles`, `characters`, `props` and `stages`
 * in memory. The wipe was invisible (`log.debug`), the user then edited, and the held-session
 * release-save wrote the emptied node back to the DB. The reset is gone; legacy blobs are mapped.
 *
 * @param raw       the raw JSONB value from `snapshots.sketch`
 * @param onAnomaly called once per unexpected-shape finding. Every anomaly is also `log.warn`n.
 */
export function normalizeSketch(
  raw: unknown,
  onAnomaly: SketchAnomalyReporter = noopAnomalyReporter,
): Sketch {
  // Every anomaly gets a warn (never debug — this is how the wipe stayed invisible for so long)
  // plus whatever the caller wants to do with it.
  const report: SketchAnomalyReporter = (anomaly) => {
    log.warn('normalizeSketch', 'unexpected sketch shape — data preserved, NOT reset', { anomaly });
    onAnomaly(anomaly);
  };

  if (raw == null) return DEFAULT_SKETCH; // no sketch yet — legitimate, NOT an anomaly
  if (!isPlainObject(raw)) {
    report(`sketch có kiểu "${typeNameOf(raw)}" thay vì object`);
    return DEFAULT_SKETCH;
  }

  const legacyKeys = LEGACY_SKETCH_KEYS.filter((k) => k in raw);
  if (legacyKeys.length > 0) {
    // No longer a reset — just a heads-up that these stale keys are not carried by the Sketch type
    // and will not survive the next save.
    report(`sketch còn key cũ không dùng nữa: ${legacyKeys.join(', ')}`);
  }

  const spreads = raw.spreads;
  if (spreads != null && !Array.isArray(spreads)) {
    report(`spreads có kiểu "${typeNameOf(spreads)}" thay vì array`);
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    base: normalizeBase(raw.base, report),
    characters: entityArrayAt(raw, 'characters', report),
    props: entityArrayAt(raw, 'props', report),
    stages: entityArrayAt(raw, 'stages', report),
    spreads: Array.isArray(spreads) ? spreads.map((s) => normalizeSketchSpread(s, report)) : [],
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
      // Preserve existing crops[] — writing raw sheet versions must NOT wipe the cut cells.
      variant.raw_sheet = { illustrations, crops: variant.raw_sheet?.crops ?? [] };
      state.sync.isDirty = true;
    }),

  // Replace the whole positional crops[] (auto-cut / re-cut result). Ensures raw_sheet exists
  // (creates it with illustrations:[] when absent). base: a single clone crop.
  setSketchVariantCrops: (kind, entityKey, variantKey, crops) =>
    set((state) => {
      const variant = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchVariantCrops', 'replace crops', { kind, entityKey, variantKey, count: crops.length });
      if (variant.raw_sheet) variant.raw_sheet.crops = crops;
      else variant.raw_sheet = { illustrations: [], crops };
      state.sync.isDirty = true;
    }),

  // 🔒 LOCK one cell as the variant's official image: set crops[cropIndex].is_selected true and
  // clear every other cell's flag (≤1 is_selected invariant). No-op if the cell is absent.
  selectSketchVariantCrop: (kind, entityKey, variantKey, cropIndex) =>
    set((state) => {
      const crops = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey)
        ?.raw_sheet?.crops;
      if (!crops?.[cropIndex]) return;
      log.debug('selectSketchVariantCrop', 'lock cell', { kind, entityKey, variantKey, cropIndex });
      crops.forEach((c, i) => {
        c.is_selected = i === cropIndex;
      });
      state.sync.isDirty = true;
    }),

  setSketchVariantCropIllustrations: (kind, entityKey, variantKey, cropIndex, illustrations) =>
    set((state) => {
      const crop = state.sketch[kind]
        .find((e) => e.key === entityKey)
        ?.variants.find((v) => v.key === variantKey)
        ?.raw_sheet?.crops?.[cropIndex];
      if (!crop) return;
      log.debug('setSketchVariantCropIllustrations', 'set', { kind, entityKey, variantKey, cropIndex, count: illustrations.length });
      crop.illustrations = illustrations;
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

  // 🔒 LOCK: exclusive is_selected within the sheet + CLONE the locked style's per-entity crop into
  // every base entity's variants[base].raw_sheet.crops[0] (illustrations:[], the single clone crop
  // is_selected=true). Illustration is flat → per-element spread = deep clone.
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
        if (c) {
          base.raw_sheet = {
            illustrations: [],
            crops: [{ is_selected: true, illustrations: c.illustrations.map((ill) => ({ ...ill })) }],
          };
        }
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
