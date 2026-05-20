// crop-sheet-layout.ts — Client-side crop-sheet layout helpers for the remix
// store. Extracted from index.ts to keep that file under the 500-line modular
// threshold. Two entry points:
//   - `computeCropSheets`              — runs at create time, mutates an insert
//     payload IN PLACE so `crop_sheets[]` (with geometry) lands in the same
//     INSERT. Per-variant partition: each character/prop builds 1 sheet per
//     designer variant that has ≥1 source crop; mix builds 1 sheet.
//   - `relayoutVariantCropSheets`      — runs on append/remove sheet; re-groups
//     crops from the (frozen) illustration FILTERED by `variantKey`, re-packs
//     at K±1 sheets within that variant scope, merges back into the entity's
//     `crop_sheets[]` keeping designer-variant ordering, then persists via
//     `patchRemixCropSheets({ kind: 'replaceAll' })` with optimistic rollback.
//
// Divergence from remix-store spec §4.4: spec describes relayout flat-mapping
// the entity's existing `crop_sheets[].crops[]` as engine input. We instead
// RE-GROUP from `illustration` via `groupCropsForKey`. Post-create
// `crops[].geometry` is px sheet-relative (engine output) — it no longer
// carries the source (%) geometry the engine needs. The illustration is frozen
// after create, so re-scan is the correct single source of truth (Validation
// Session 1). Same path as `computeCropSheets` → DRY.
//
// Engine DUAL-WRITE (Validation S1): every built sheet sets
// `sheet.variant_key = variantKey` AND `crops[].variant = variantKey` for
// backward-compat with legacy readers that filter by `crop.variant`.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  InsertableRemixRow,
  Remix,
  RemixCrop,
  RemixCropSheet,
  RemixIllustration,
} from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import {
  DIMENSION_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
} from '@/constants/canvas-dimension-constants';
import { computeCropSheetLayout } from '@/utils/crop-sheet-layout-engine';
import type {
  CropInput,
  CropSheetLayoutResult,
} from '@/utils/crop-sheet-layout-engine';
import { groupCropsForKey } from '@/utils/crop-grouping';
import type { CropGroupType } from '@/utils/crop-grouping';
import type { CropSheetUpdate } from './types';

const log = createLogger('Store', 'CropSheetLayout');

/** Minimum crop sheets an entity must keep PER VARIANT — re-layout never drops
 *  below this so every variant group always has at least one sheet to render. */
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

/** Builds the title for sheet `index` within a variant scope — `"sheet <n+1>"`
 *  (1-based, scoped to the variant group). The owning entity + variant are
 *  rendered separately in the sidebar header. */
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
 *
 * DUAL-WRITE (Validation S1):
 *   - sheet.variant_key = variantKey
 *   - crops[].variant   = variantKey (mix: pass-through cropMeta.variant)
 */
export function buildSheetsFromLayout(
  layout: CropSheetLayoutResult,
  cropMetaById: Record<string, RemixCrop>,
  variantKey: string | null,
): RemixCropSheet[] {
  return layout.sheets.map((sheet) => ({
    title: sheetTitle(sheet.index),
    sheet_geometry: sheet.sheetGeometry,
    image_url: '',
    swap_results: [],
    crops: sheet.placements.map((p) => {
      const meta = cropMetaById[p.id];
      // Mix entity: keep pre-existing `meta.variant` (e.g. 'casual+sleep'
      // joined). Char/prop entity: dual-write `variant = variantKey` so legacy
      // consumers that filter by `crop.variant` still work after relayout.
      const cropVariant = variantKey ?? meta.variant;
      return {
        ...meta,
        geometry: p.geometry,
        variant: cropVariant,
      };
    }),
    variant_key: variantKey,
  }));
}

/**
 * Computes crop sheets for every entity (characters + props + mixes) of an
 * insert payload and writes them back IN PLACE — called inside `createRemix`
 * BEFORE the Supabase INSERT so `crop_sheets[]` is persisted in one round-trip.
 *
 * Per-variant partition (Validation S1):
 *   character/prop → for each designer variant key that has ≥1 source crop in
 *     `groupCropsForKey()` output, pack a single sheet with `variant_key = vk`.
 *     Variant order follows the entity's designer-defined `variants[]`.
 *   mix            → pack all crops onto 1 sheet with `variant_key = null`.
 *
 * Fallback: a source crop whose `meta.variant` is empty or doesn't match any
 * designer variant key is bucketed under the literal `'base'` and written as a
 * single `variant_key: 'base'` sheet. This keeps entities without designer
 * variants (or with stale tag-spec) renderable.
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

  const layoutMix = (key: string): RemixCropSheet[] => {
    const { cropInputs, cropMetaById } = groupCropsForKey(
      payload.illustration,
      'mix',
      key,
    );
    log.debug('computeCropSheets', 'grouped mix', {
      key,
      cropCount: cropInputs.length,
    });
    const layout = computeCropSheetLayout(cropInputs, {
      sheetCount: 1,
      spread,
    });
    return buildSheetsFromLayout(layout, cropMetaById, null);
  };

  const layoutCharOrProp = (
    type: 'character' | 'prop',
    key: string,
    variantKeyOrder: string[],
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
      variantKeys: variantKeyOrder,
    });
    if (cropInputs.length === 0) return [];

    // Bucket cropInputs by their source-tag variant_key (read from cropMeta).
    // Empty/unknown variant → 'base'.
    const knownVariantKeys = new Set(variantKeyOrder);
    const buckets = new Map<string, CropInput[]>();
    for (const ci of cropInputs) {
      const metaVariant = cropMetaById[ci.id]?.variant ?? '';
      const bucketKey =
        metaVariant && knownVariantKeys.has(metaVariant) ? metaVariant : 'base';
      const existing = buckets.get(bucketKey);
      if (existing) existing.push(ci);
      else buckets.set(bucketKey, [ci]);
    }

    // Walk designer-variant order first → deterministic sheet ordering.
    // Append 'base' bucket (orphans/no-variants) at the tail.
    const sheets: RemixCropSheet[] = [];
    const seen = new Set<string>();
    for (const vk of variantKeyOrder) {
      const inputs = buckets.get(vk);
      if (!inputs || inputs.length === 0) continue;
      seen.add(vk);
      const layout = computeCropSheetLayout(inputs, { sheetCount: 1, spread });
      sheets.push(...buildSheetsFromLayout(layout, cropMetaById, vk));
    }
    const baseInputs = buckets.get('base');
    if (baseInputs && baseInputs.length > 0 && !seen.has('base')) {
      const layout = computeCropSheetLayout(baseInputs, {
        sheetCount: 1,
        spread,
      });
      sheets.push(...buildSheetsFromLayout(layout, cropMetaById, 'base'));
    }
    return sheets;
  };

  for (const c of payload.characters) {
    const variantKeys = (c.variants ?? []).map((v) => v.key);
    c.crop_sheets = layoutCharOrProp('character', c.key, variantKeys);
  }
  for (const p of payload.props) {
    const variantKeys = (p.variants ?? []).map((v) => v.key);
    p.crop_sheets = layoutCharOrProp('prop', p.key, variantKeys);
  }
  for (const m of payload.mixes) {
    m.crop_sheets = layoutMix(canonicalMixKey(m.keys));
  }

  log.info('computeCropSheets', 'done', {
    charCount: payload.characters.length,
    propCount: payload.props.length,
    mixCount: payload.mixes.length,
  });
}

// ── relayout (variant-scoped append / remove sheet) ──────────────────────────

/** Narrow store-accessor pair so this module stays decoupled from the full
 *  zustand store type (avoids a circular import with index.ts). */
interface RelayoutDeps {
  set: (updater: (s: { remixes: Remix[] }) => { remixes: Remix[] }) => void;
  get: () => { remixes: Remix[] };
  /** Active book dimension code — resolves the layout spread size. */
  dimension: number | null | undefined;
  /** Cross-slice action — in-store-only update of an entity's `crop_sheets[]`
   *  (CRUD slice). Supabase persistence is handled HERE (engine) so the
   *  swap-slice caller doesn't have to wire two pieces. */
  patchRemixCropSheets: (remixId: string, updates: CropSheetUpdate[]) => void;
}

interface ResolvedEntityForRelayout {
  crop_sheets: RemixCropSheet[];
  /** Designer-defined variants — `null` for mix. */
  rawVariants: { key: string }[] | null;
}

function resolveEntityForRelayout(
  remix: Remix,
  type: CropGroupType,
  key: string,
): ResolvedEntityForRelayout | null {
  if (type === 'character') {
    const c = remix.characters.find((x) => x.key === key);
    if (!c) return null;
    return { crop_sheets: c.crop_sheets, rawVariants: c.variants ?? [] };
  }
  if (type === 'prop') {
    const p = remix.props.find((x) => x.key === key);
    if (!p) return null;
    return { crop_sheets: p.crop_sheets, rawVariants: p.variants ?? [] };
  }
  const m = remix.mixes.find((x) => canonicalMixKey(x.keys) === key);
  if (!m) return null;
  return { crop_sheets: m.crop_sheets, rawVariants: null };
}

/**
 * Merge per-variant relayout output back into the entity's flat `crop_sheets[]`
 * keeping designer-variant ordering. Pseudocode in phase-02 §Merge ordering.
 *
 * - Bucket existing `otherSheets` by `variant_key` (string|null).
 * - Bucket-overwrite the target variant with `newTargetSheets`.
 * - Mix entity (`rawVariants === null`) returns `newTargetSheets` verbatim
 *   (no sibling variants to preserve).
 * - For char/prop, walk `rawVariants[]` order; append each bucket. Orphan
 *   sheets (variant_key not in rawVariants) log warn + append at tail.
 */
function mergeKeepingVariantOrder(
  otherSheets: RemixCropSheet[],
  newTargetSheets: RemixCropSheet[],
  targetVariantKey: string | null,
  rawVariants: { key: string }[] | null,
): RemixCropSheet[] {
  if (rawVariants === null) {
    // Mix: target IS the whole entity scope.
    return newTargetSheets;
  }

  type BucketKey = string | null;
  const buckets = new Map<BucketKey, RemixCropSheet[]>();
  for (const sheet of otherSheets) {
    const vk = sheet.variant_key;
    const arr = buckets.get(vk);
    if (arr) arr.push(sheet);
    else buckets.set(vk, [sheet]);
  }
  // Overwrite/insert target bucket with the fresh relayout.
  buckets.set(targetVariantKey, newTargetSheets);

  const out: RemixCropSheet[] = [];
  const rawVariantKeySet = new Set(rawVariants.map((v) => v.key));

  // 1) Walk designer-variant order. Each variant's bucket (if non-empty) goes
  //    in deterministic order.
  for (const v of rawVariants) {
    const arr = buckets.get(v.key);
    if (arr && arr.length > 0) out.push(...arr);
  }

  // 2) Defensive orphan handling — any bucket whose key isn't a designer
  //    variant AND isn't null gets appended at the tail with a warn. Also
  //    catches the `'base'` fallback bucket from `computeCropSheets`.
  for (const [vKey, sheets] of buckets.entries()) {
    if (vKey === null) continue;
    if (rawVariantKeySet.has(vKey)) continue;
    log.warn(
      'mergeKeepingVariantOrder',
      'orphan sheets — append at tail',
      { vKey, count: sheets.length },
    );
    out.push(...sheets);
  }

  // 3) `null`-keyed sheets on a char/prop entity should never happen (engine
  //    always writes a string). Defensive: append at tail with a warn.
  const nullBucket = buckets.get(null);
  if (nullBucket && nullBucket.length > 0) {
    log.warn(
      'mergeKeepingVariantOrder',
      'null variant_key on non-mix entity — append at tail',
      { count: nullBucket.length },
    );
    out.push(...nullBucket);
  }

  return out;
}

/**
 * Re-layouts the crop sheets of ONE variant group of an entity at
 * `currentVariantCount + delta` sheets. Sibling variants are left untouched.
 *
 * Flow:
 *  1) Resolve entity (with `rawVariants[]` for char/prop, null for mix).
 *  2) Partition `entity.crop_sheets` into `targetSheets` (matching
 *     `variantKey`) + `otherSheets` (everything else).
 *  3) Clamp the next target count to `[SHEET_MIN, ∞)`.
 *  4) Re-group crops from the frozen illustration, FILTER by `variantKey`
 *     (mix → no filter, packs all).
 *  5) Engine-pack at the new sheet count.
 *  6) Build new sheets with `variant_key = variantKey` (dual-write
 *     `crops[].variant = variantKey`).
 *  7) Merge back into a flat `crop_sheets[]` keeping designer-variant order.
 *  8) Persist via `patchRemixCropSheets({ kind: 'replaceAll' })`. The CRUD
 *     slice owns the optimistic update + Supabase write; this module is now
 *     write-only on the engine path.
 *
 * Returns `false` on any guard hit (missing remix/entity, no-op count change,
 * empty crop inputs); `true` after the engine relayout is dispatched.
 *
 * SWAP-RESULTS CONTRACT (callers MUST gate): a successful re-layout REBUILDS
 * the target variant's sheets via `buildSheetsFromLayout`, which hardcodes
 * `swap_results: []` on every sheet — i.e. it DESTROYS swap_results of every
 * sheet IN THE TARGET VARIANT. Sibling variants are pass-through and preserve
 * their swap_results. The store does NOT warn. Any caller of `appendCropSheet`/
 * `removeCropSheet` (currently only the P6 swap modal's confirm dialog) MUST
 * gate on existing `swap_results` before invoking — see `slices/swap-slice.ts`.
 */
export async function relayoutVariantCropSheets(
  deps: RelayoutDeps,
  remixId: string,
  type: CropGroupType,
  key: string,
  variantKey: string | null,
  delta: number,
): Promise<boolean> {
  const { set, get, dimension, patchRemixCropSheets } = deps;
  log.info('relayoutVariantCropSheets', 'start', {
    remixId,
    type,
    key,
    variantKey,
    delta,
  });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('relayoutVariantCropSheets', 'remix not found — abort', {
      remixId,
    });
    return false;
  }

  const entity = resolveEntityForRelayout(prevRemix, type, key);
  if (!entity) {
    log.warn('relayoutVariantCropSheets', 'entity not found — abort', {
      remixId,
      type,
      key,
    });
    return false;
  }

  // Partition existing sheets by variant. Mix → all sheets are "target"
  // (variantKey is null on both sides).
  const targetSheets: RemixCropSheet[] = [];
  const otherSheets: RemixCropSheet[] = [];
  for (const sheet of entity.crop_sheets) {
    if (sheet.variant_key === variantKey) targetSheets.push(sheet);
    else otherSheets.push(sheet);
  }

  const currentCount = targetSheets.length;
  const nextCount = Math.max(SHEET_MIN, currentCount + delta);
  if (nextCount === currentCount) {
    log.debug('relayoutVariantCropSheets', 'no count change — skip', {
      remixId,
      key,
      variantKey,
      currentCount,
    });
    return false;
  }

  // Re-group from the frozen illustration — single source of truth for the
  // source (%) geometry the engine needs (post-create crop geometry is px).
  const { cropInputs, cropMetaById } = groupCropsForKey(
    prevRemix.illustration as RemixIllustration,
    type,
    key,
  );

  // Variant-scope filter:
  //   - mix entity (variantKey === null) → no filter, pack everything.
  //   - char/prop → filter cropInputs to the target variant. Inputs whose
  //     source-tag variant_key doesn't match any designer variant fall under
  //     the literal `'base'` bucket (mirrors `computeCropSheets`).
  let scopedInputs: CropInput[];
  if (variantKey === null) {
    scopedInputs = cropInputs;
  } else {
    const designerKeys = new Set(
      (entity.rawVariants ?? []).map((v) => v.key),
    );
    scopedInputs = cropInputs.filter((ci) => {
      const metaVariant = cropMetaById[ci.id]?.variant ?? '';
      const bucketKey =
        metaVariant && designerKeys.has(metaVariant) ? metaVariant : 'base';
      return bucketKey === variantKey;
    });
  }

  if (scopedInputs.length === 0) {
    log.warn('relayoutVariantCropSheets', 'no crops in variant scope — abort', {
      remixId,
      key,
      variantKey,
    });
    return false;
  }

  const spread = resolveSpread(dimension);
  const layout = computeCropSheetLayout(scopedInputs, {
    sheetCount: nextCount,
    spread,
  });
  const newTargetSheets = buildSheetsFromLayout(
    layout,
    cropMetaById,
    variantKey,
  );

  const merged = mergeKeepingVariantOrder(
    otherSheets,
    newTargetSheets,
    variantKey,
    entity.rawVariants,
  );

  log.debug('relayoutVariantCropSheets', 'optimistic replaceAll', {
    remixId,
    type,
    key,
    variantKey,
    currentCount,
    nextCount,
    nextTotalSheets: merged.length,
    cropCount: scopedInputs.length,
  });

  // Optimistic in-store update via CRUD slice's `patchRemixCropSheets`. Sync
  // (in-memory only — no Supabase). Persistence below.
  patchRemixCropSheets(remixId, [
    {
      kind: 'replaceAll',
      entityType: type,
      entityKey: key,
      sheets: merged,
    },
  ]);

  // Persist the single owning JSONB column with the freshest in-store value.
  const column = ENTITY_COLUMN[type];
  const remixAfter = get().remixes.find((r) => r.id === remixId);
  if (!remixAfter) {
    log.warn('relayoutVariantCropSheets', 'remix gone before persist — skip', {
      remixId,
    });
    return false;
  }

  const { error } = await supabase
    .from('remixes')
    .update({ [column]: remixAfter[column] })
    .eq('id', remixId);

  if (error) {
    log.error('relayoutVariantCropSheets', 'persist failed — rollback', {
      remixId,
      key,
      variantKey,
      column,
      error: error.message,
    });
    // ROLLBACK LIMITATION (v1 single-writer assumption): restore the whole
    // remix snapshot pre-relayout. If a concurrent writer mutated this remix
    // during the persist window, that change is clobbered. Safe in v1 — the
    // swap modal is the only writer at a time.
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
    }));
    return false;
  }

  log.info('relayoutVariantCropSheets', 'done', {
    remixId,
    key,
    variantKey,
    nextCount,
  });
  return true;
}
