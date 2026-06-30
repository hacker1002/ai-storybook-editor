import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchSlice } from '../types';
import type { Sketch, SketchEntity, SketchSpread } from '@/types/sketch';
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

// Minimal slice: state + setSketch/clearSketch (enough for guard round-trip + future
// consumers). CRUD entity/spread/textbox actions are deferred per scope decision Q5.
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
});
