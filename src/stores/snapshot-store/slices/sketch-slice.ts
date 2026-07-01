import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchSlice } from '../types';
import type { Sketch, SketchEntity, SketchSpread } from '@/types/sketch';
import type { SketchVariant, SketchEntityKind, SketchPageType, ArtDirection, SketchTextboxContent } from '@/types/sketch';
import { isSketchTextboxContent } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchSlice');

export const DEFAULT_SKETCH: Sketch = {
  id: null,
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
  // Legacy spreads carried an `images[]` array; the new shape uses `pages[]` + `textboxes[]`.
  const spreads = raw.spreads;
  if (Array.isArray(spreads) && spreads.length > 0) {
    const first = spreads[0];
    if (isPlainObject(first) && 'images' in first) return true;
  }
  return false;
}

function asEntityArray(v: unknown): SketchEntity[] {
  return Array.isArray(v) ? (v as SketchEntity[]) : [];
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
    characters: asEntityArray(raw.characters),
    props: asEntityArray(raw.props),
    stages: asEntityArray(raw.stages),
    spreads: Array.isArray(raw.spreads) ? (raw.spreads as SketchSpread[]) : [],
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

  setSketchEntityMediaUrl: (kind: SketchEntityKind, key: string, mediaUrl: string) =>
    set((state) => {
      const entity = state.sketch[kind].find((e) => e.key === key);
      if (entity) {
        log.debug('setSketchEntityMediaUrl', 'set', { kind, key });
        entity.media_url = mediaUrl;
        state.sync.isDirty = true;
      }
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

  setSketchSpreadMediaUrl: (id: string, mediaUrl: string) =>
    set((state) => {
      const spread = state.sketch.spreads.find((s) => s.id === id);
      if (spread) {
        log.debug('setSketchSpreadMediaUrl', 'set', { id });
        spread.media_url = mediaUrl;
        state.sync.isDirty = true;
      }
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
