// crop-sheet-layout.ts — Client-side crop-sheet layout helpers for the remix
// store. Extracted from index.ts to keep that file under the 500-line modular
// threshold. Two entry points:
//   - `computeCropSheets`   — runs at create time, mutates an insert payload
//     IN PLACE so `crop_sheets[]` (with geometry) lands in the same INSERT.
//   - `relayoutCropSheets`  — runs on append/remove sheet; re-groups crops from
//     the (frozen) illustration and re-packs at K±1 sheets, then persists the
//     owning JSONB column with optimistic rollback.
//
// Divergence from remix-store spec §4.4: spec describes `relayoutCropSheets`
// flat-mapping the entity's existing `crop_sheets[].crops[]` as engine input.
// We instead RE-GROUP from `illustration` via `groupCropsForKey`. Post-create
// `crops[].geometry` is px sheet-relative (engine output) — it no longer
// carries the source (%) geometry the engine needs. The illustration is frozen
// after create, so re-scan is the correct single source of truth (Validation
// Session 1). Same path as `computeCropSheets` → DRY.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  InsertableRemixRow,
  Remix,
  RemixCharacter,
  RemixCrop,
  RemixCropSheet,
  RemixIllustration,
  RemixMix,
  RemixProp,
} from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import {
  DIMENSION_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
} from '@/constants/canvas-dimension-constants';
import { computeCropSheetLayout } from '@/utils/crop-sheet-layout-engine';
import type { CropSheetLayoutResult } from '@/utils/crop-sheet-layout-engine';
import { groupCropsForKey } from '@/utils/crop-grouping';
import type { CropGroupType } from '@/utils/crop-grouping';

const log = createLogger('Store', 'CropSheetLayout');

/** Minimum crop sheets an entity must keep — re-layout never drops below this
 *  so every entity always has at least one sheet to render. */
export const SHEET_MIN = 1;

/** The JSONB column an entity type lives in — relayout persists exactly one. */
type EntityColumn = 'characters' | 'props' | 'mixes';

const ENTITY_COLUMN: Record<CropGroupType, EntityColumn> = {
  character: 'characters',
  prop: 'props',
  mix: 'mixes',
};

/** Resolves the spread (px) for the layout engine from a book dimension code.
 *  Falls back to the legacy 800×600 spread when the dimension is unset/unknown. */
function resolveSpread(dimension: number | null | undefined): {
  width: number;
  height: number;
} {
  if (dimension == null) return DEFAULT_CANVAS_SIZE;
  return DIMENSION_CANVAS_SIZE[dimension] ?? DEFAULT_CANVAS_SIZE;
}

/** Builds the title for sheet `index` — `"sheet <n+1>"` (1-based, no entity
 *  name). The owning entity is rendered separately in the sidebar header. */
function sheetTitle(index: number): string {
  return `sheet ${index + 1}`;
}

/**
 * Materializes engine output into `RemixCropSheet[]`.
 *
 * Each placement's `geometry` (px, sheet-relative — engine output) overwrites
 * the placeholder geometry on the matching source crop metadata. `image_url`
 * is always '' (build API removed — client composes from crops) and
 * `swap_results` is always [] (geometry changed → any prior swap is stale).
 */
export function buildSheetsFromLayout(
  layout: CropSheetLayoutResult,
  cropMetaById: Record<string, RemixCrop>,
): RemixCropSheet[] {
  return layout.sheets.map((sheet) => ({
    title: sheetTitle(sheet.index),
    sheet_geometry: sheet.sheetGeometry,
    image_url: '',
    swap_results: [],
    crops: sheet.placements.map((p) => ({
      ...cropMetaById[p.id],
      geometry: p.geometry,
    })),
  }));
}

/**
 * Computes crop sheets for every entity (characters + props + mixes) of an
 * insert payload and writes them back IN PLACE — called inside `createRemix`
 * BEFORE the Supabase INSERT so `crop_sheets[]` is persisted in one round-trip.
 *
 * Each entity starts with exactly one sheet (`sheetCount: 1`); append/remove
 * later re-layouts via `relayoutCropSheets`.
 */
export function computeCropSheets(
  payload: InsertableRemixRow,
  dimension: number | null | undefined,
): void {
  const spread = resolveSpread(dimension);
  log.info('computeCropSheets', 'start', {
    charCount: payload.characters.length,
    propCount: payload.props.length,
    mixCount: payload.mixes.length,
    spreadW: spread.width,
    spreadH: spread.height,
  });

  const layoutOne = (
    type: CropGroupType,
    key: string,
  ): RemixCropSheet[] => {
    const { cropInputs, cropMetaById } = groupCropsForKey(
      payload.illustration,
      type,
      key,
    );
    log.debug('computeCropSheets', 'grouped entity', {
      type,
      key,
      cropCount: cropInputs.length,
    });
    const layout = computeCropSheetLayout(cropInputs, {
      sheetCount: 1,
      spread,
    });
    return buildSheetsFromLayout(layout, cropMetaById);
  };

  for (const c of payload.characters) {
    c.crop_sheets = layoutOne('character', c.key);
  }
  for (const p of payload.props) {
    p.crop_sheets = layoutOne('prop', p.key);
  }
  for (const m of payload.mixes) {
    m.crop_sheets = layoutOne('mix', canonicalMixKey(m.keys));
  }

  log.info('computeCropSheets', 'done', {
    charCount: payload.characters.length,
    propCount: payload.props.length,
    mixCount: payload.mixes.length,
  });
}

// ── relayout (append / remove sheet) ─────────────────────────────────────────

/** Narrow store-accessor pair so this module stays decoupled from the full
 *  zustand store type (avoids a circular import with index.ts). */
interface RelayoutDeps {
  set: (updater: (s: { remixes: Remix[] }) => { remixes: Remix[] }) => void;
  get: () => { remixes: Remix[] };
  /** Active book dimension code — resolves the layout spread size. */
  dimension: number | null | undefined;
}

/** Normalized read-projection of one remix entity. */
interface ResolvedEntity {
  crop_sheets: RemixCropSheet[];
}

function resolveEntity(
  remix: Remix,
  type: CropGroupType,
  key: string,
): ResolvedEntity | null {
  if (type === 'character') {
    return remix.characters.find((c) => c.key === key) ?? null;
  }
  if (type === 'prop') {
    return remix.props.find((p) => p.key === key) ?? null;
  }
  return remix.mixes.find((m) => canonicalMixKey(m.keys) === key) ?? null;
}

/** Returns a new Remix with the matched entity's `crop_sheets[]` replaced.
 *  Mix matches by `canonicalMixKey(keys)`. */
function applyEntitySheets(
  remix: Remix,
  type: CropGroupType,
  key: string,
  nextSheets: RemixCropSheet[],
): Remix {
  if (type === 'character') {
    return {
      ...remix,
      characters: remix.characters.map((c): RemixCharacter =>
        c.key === key ? { ...c, crop_sheets: nextSheets } : c,
      ),
    };
  }
  if (type === 'prop') {
    return {
      ...remix,
      props: remix.props.map((p): RemixProp =>
        p.key === key ? { ...p, crop_sheets: nextSheets } : p,
      ),
    };
  }
  return {
    ...remix,
    mixes: remix.mixes.map((m): RemixMix =>
      canonicalMixKey(m.keys) === key ? { ...m, crop_sheets: nextSheets } : m,
    ),
  };
}

/**
 * Re-layouts an entity's crop sheets at `currentCount + delta` sheets.
 *
 * Flow: resolve entity → clamp the target sheet count to `[SHEET_MIN, ∞)` →
 * re-group crops from the frozen `illustration` → re-pack via the layout engine
 * → optimistically replace `crop_sheets[]` in the store → persist the owning
 * JSONB column → roll back on persist failure.
 *
 * Shared by `appendCropSheet` (delta +1) and `removeCropSheet` (delta -1).
 * Returns `false` on any guard hit (missing remix/entity, no-op count change,
 * persist failure); `true` on a successful, persisted re-layout.
 *
 * SWAP-RESULTS CONTRACT (callers MUST gate): a successful re-layout REBUILDS
 * `crop_sheets[]` via `buildSheetsFromLayout`, which hardcodes `swap_results: []`
 * on every sheet — i.e. it DESTROYS all swap_results for this entity. The store
 * does NOT warn. Any caller of `appendCropSheet`/`removeCropSheet` (currently
 * only the P6 swap modal's confirm dialog) MUST itself gate on existing
 * `swap_results` before invoking — see `slices/swap-slice.ts`.
 *
 * ROLLBACK LIMITATION (v1 assumption — single-writer): `prevRemix` is a shallow
 * snapshot of the WHOLE remix captured BEFORE the optimistic `set` and the
 * `await supabase...update`. On persist failure the rollback restores
 * `prevRemix` wholesale. If any OTHER action mutated this remix during the
 * persist window, that concurrent change is CLOBBERED back to `prevRemix`.
 * Safe in v1 because the swap modal is the only writer of a remix at a time —
 * there is no concurrent mutation path. Do NOT re-architect; if a second
 * concurrent writer is ever added, narrow the rollback to the owning entity
 * field (mirror `applyEntitySheets` with the pre-relayout sheets) instead.
 */
export async function relayoutCropSheets(
  deps: RelayoutDeps,
  remixId: string,
  type: CropGroupType,
  key: string,
  delta: number,
): Promise<boolean> {
  const { set, get, dimension } = deps;
  log.info('relayoutCropSheets', 'start', { remixId, type, key, delta });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('relayoutCropSheets', 'remix not found — abort', { remixId });
    return false;
  }

  const entity = resolveEntity(prevRemix, type, key);
  if (!entity) {
    log.warn('relayoutCropSheets', 'entity not found — abort', {
      remixId,
      type,
      key,
    });
    return false;
  }

  const currentCount = entity.crop_sheets.length;
  const nextCount = Math.max(SHEET_MIN, currentCount + delta);
  if (nextCount === currentCount) {
    log.debug('relayoutCropSheets', 'no count change — skip', {
      remixId,
      key,
      currentCount,
    });
    return false;
  }

  // Re-group from the frozen illustration — the single source of truth for the
  // source (%) geometry the engine needs (post-create crop geometry is px).
  const { cropInputs, cropMetaById } = groupCropsForKey(
    prevRemix.illustration as RemixIllustration,
    type,
    key,
  );
  const spread = resolveSpread(dimension);
  const layout = computeCropSheetLayout(cropInputs, {
    sheetCount: nextCount,
    spread,
  });
  const nextSheets = buildSheetsFromLayout(layout, cropMetaById);

  log.debug('relayoutCropSheets', 'optimistic update', {
    remixId,
    type,
    key,
    currentCount,
    nextCount,
    cropCount: cropInputs.length,
  });
  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId ? applyEntitySheets(r, type, key, nextSheets) : r,
    ),
  }));

  // Persist the single owning column with the freshest in-store value.
  const column = ENTITY_COLUMN[type];
  const remixAfter = get().remixes.find((r) => r.id === remixId);
  if (!remixAfter) {
    log.warn('relayoutCropSheets', 'remix gone before persist — skip', {
      remixId,
    });
    return false;
  }

  const { error } = await supabase
    .from('remixes')
    .update({ [column]: remixAfter[column] })
    .eq('id', remixId);

  if (error) {
    log.error('relayoutCropSheets', 'persist failed — rollback', {
      remixId,
      key,
      column,
      error: error.message,
    });
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
    }));
    return false;
  }

  log.info('relayoutCropSheets', 'done', { remixId, key, nextCount });
  return true;
}
