// sprite-layout.ts — Client-side sprite-sheet layout for the Variants tab
// (sprite-swap batch model). Mirrors `crop-sheet-layout.ts` (the mix plane) but
// on the `remixes.sprites[]` column and SINGLE-SUBJECT: each crop is ONE
// character/prop variant's ORIGINAL artwork (not a multi-subject spread crop).
//
// LAYOUT ENGINE REUSE (divergence from plan §02 — fallback 3B, by design):
// `utils/crop-sheet-layout-engine.ts::computeCropSheetLayout` is already
// key-agnostic — it takes `CropInput[]` (id + widthPct/heightPct + objectKey
// affinity) and packs into K sheets via potpack + entity-affinity partition. We
// reuse it VERBATIM for sprites rather than extracting a separate `pack` util +
// refactoring the mix engine: the engine IS the shared pack, so DRY is already
// satisfied and the mix path stays byte-for-byte untouched (zero Batches
// regression risk — golden test trivially passes). Sprite cells are uniform
// squares (variant artwork ≈ square) packed against a synthetic SQUARE spread
// (sprite sheets are NOT tied to the book canvas dimension).

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { newUuid } from '@/utils/uuid';
import type {
  Remix,
  RemixCharacter,
  RemixSpriteCropSheet,
  RemixSpriteEntry,
  SpriteCrop,
} from '@/types/remix';
import { computeCropSheetLayout } from '@/utils/crop-sheet-layout-engine';
import type {
  CropInput,
  CropSheetLayoutResult,
} from '@/utils/crop-sheet-layout-engine';
import { SHEET_MIN, SHEET_MAX } from './crop-sheet-layout';
import type { RelayoutDeps } from './crop-sheet-layout';

const log = createLogger('Store', 'SpriteLayout');

/** A remix must keep at least this many sprites. The last sprite cannot be
 *  removed (caller also hides the affordance). */
export const SPRITE_MIN = 1;

/** Synthetic SQUARE spread fed to the layout engine for sprites. Variant
 *  artwork is standalone (not relative to the book canvas), so we pack against
 *  a fixed square frame — the Stage scales the composed sheet to fit anyway.
 *  Combined with a uniform square `SPRITE_CELL_PCT` this yields evenly-sized,
 *  non-overlapping square cells. */
const SPRITE_SPREAD = { width: 1000, height: 1000 } as const;
/** Each variant cell = this % of the synthetic square spread on BOTH axes →
 *  ~220px square cells. Absolute size is cosmetic (Stage rescales); uniformity
 *  is what matters for a clean grid. */
const SPRITE_CELL_PCT = 22;

/** Pre-geometry sprite cell (engine input meta) — a `SpriteCrop` minus the
 *  engine-computed `geometry`. */
export type SpriteCell = Omit<SpriteCrop, 'geometry'>;

/** Stable per-cell key — `${type}/${object_key}/${variant_key}`. Single source
 *  of truth for selection sets, ownership keys, and engine `CropInput.id`. */
export function spriteCellKey(cell: {
  type: string;
  object_key: string;
  variant_key: string;
}): string {
  return `${cell.type}/${cell.object_key}/${cell.variant_key}`;
}

/** Builds the title for sheet `index` — `"sheet <n+1>"` (1-based, mix parity). */
function sheetTitle(index: number): string {
  return `sheet ${index + 1}`;
}

/**
 * Resolve a variant's ORIGINAL artwork URL: selected illustration → first
 * illustration → null. NEVER reads `visual_swap_url` (sprite-swap must run on
 * the source artwork, not a prior swap output — avoids re-swap compounding).
 */
export function originalVariantArtwork(variant: {
  illustrations?: { media_url: string; is_selected: boolean }[];
}): string | null {
  const list = variant.illustrations ?? [];
  const selected = list.find((i) => i.is_selected);
  return selected?.media_url ?? list[0]?.media_url ?? null;
}

/** True when a character is enabled in the remix config (drives sprite scope).
 *  Char absent from `remix_config.characters` → not in scope (excluded). */
function isCharacterEnabled(remix: Remix, charKey: string): boolean {
  const cfg = remix.remix_config.characters.find((c) => c.key === charKey);
  return !!cfg && cfg.is_enabled;
}

/**
 * Collect the sprite cells for a remix: every variant (with resolvable artwork)
 * of every ENABLED character, in `remix.characters` order. char-only v1 — props
 * are excluded from the layout. De-duplicated by `spriteCellKey`.
 */
export function groupVariantsForSprite(remix: Remix): SpriteCell[] {
  const cells: SpriteCell[] = [];
  const seen = new Set<string>();

  const pushVariants = (
    chars: RemixCharacter[],
    type: 'character',
  ): void => {
    for (const char of chars) {
      if (!isCharacterEnabled(remix, char.key)) continue;
      for (const variant of char.variants ?? []) {
        const media_url = originalVariantArtwork(variant);
        if (!media_url) continue; // no artwork → cannot swap; skip
        const cell: SpriteCell = {
          type,
          object_key: char.key,
          variant_key: variant.key,
          media_url,
        };
        const key = spriteCellKey(cell);
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push(cell);
      }
    }
  };

  pushVariants(remix.characters, 'character');

  log.debug('groupVariantsForSprite', 'grouped', {
    charCount: remix.characters.length,
    cellCount: cells.length,
  });
  return cells;
}

/** Materialize engine output into `RemixSpriteCropSheet[]`. Each placement's
 *  geometry (px, sheet-relative — engine output) is attached to the matching
 *  cell. `image_url` always '' (client composes from crops); `swap_results`
 *  always [] (fresh layout → any prior swap is stale geometry). */
function buildSpriteSheetsFromLayout(
  layout: CropSheetLayoutResult,
  cellByKey: Record<string, SpriteCell>,
): RemixSpriteCropSheet[] {
  return layout.sheets.map((sheet) => ({
    title: sheetTitle(sheet.index),
    sheet_geometry: sheet.sheetGeometry,
    image_url: '',
    swap_results: [],
    crops: sheet.placements
      .map((p) => {
        const cell = cellByKey[p.id];
        if (!cell) return null;
        const crop: SpriteCrop = { ...cell, geometry: p.geometry };
        return crop;
      })
      .filter((c): c is SpriteCrop => c !== null),
  }));
}

/**
 * Partition sprite cells into K sheets via the shared layout engine. Affinity
 * key = `object_key` (variants of one character stay on the same sheet where
 * possible). Uniform square cells against the synthetic square spread.
 */
export function partitionByObjectAffinity(
  cells: SpriteCell[],
  k: number,
): RemixSpriteCropSheet[] {
  const cellByKey: Record<string, SpriteCell> = {};
  const inputs: CropInput[] = [];
  for (const cell of cells) {
    const id = spriteCellKey(cell);
    cellByKey[id] = cell;
    inputs.push({
      id,
      widthPct: SPRITE_CELL_PCT,
      heightPct: SPRITE_CELL_PCT,
      objectKey: cell.object_key,
    });
  }
  const layout = computeCropSheetLayout(inputs, {
    sheetCount: Math.max(1, k),
    spread: SPRITE_SPREAD,
    // Sprite cells are UNIFORM SQUARES and the sheet is NOT canvas-bound, so the
    // engine's default landscape bias (τ=0.08) is wrong here — it would override
    // the genuinely-best-fill SQUARE sheet with a wider landscape one (e.g. 5
    // square cells: square 1:1 → 2 cols [2,2,1] has higher fill than 21:9 → 3
    // cols [3,2], yet the bias picks 21:9). τ=0 picks the true best-fill ratio,
    // which for square cells is the near-square grid the user expects.
    landscapeTolerance: 0,
  });
  return buildSpriteSheetsFromLayout(layout, cellByKey);
}

/** Distinct (deduped) cells currently living on a sprite — reads ONLY pre-swap
 *  `sheet.crops[]` (never `swap_results[].crops[]`). Dedup key = cellKey. */
export function currentCellsOfSprite(sprite: RemixSpriteEntry): SpriteCrop[] {
  const seen = new Set<string>();
  const out: SpriteCrop[] = [];
  for (const sheet of sprite.crop_sheets) {
    for (const crop of sheet.crops) {
      const key = spriteCellKey(crop);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(crop);
    }
  }
  return out;
}

/** Build the K=1 sheet set for a NEW sprite from a selected subset of the active
 *  sprite's cells (modal "Add as Sprite"). `media_url` is the ORIGINAL artwork
 *  carried on the active sprite's pre-swap crops. Returns [] when nothing
 *  matched (caller throws on stale selection). */
export function addSpriteSubset(
  activeSprite: RemixSpriteEntry,
  selectedCellKeys: ReadonlySet<string>,
): RemixSpriteCropSheet[] {
  const subset: SpriteCell[] = currentCellsOfSprite(activeSprite)
    .filter((c) => selectedCellKeys.has(spriteCellKey(c)))
    .map((c) => ({
      type: c.type,
      object_key: c.object_key,
      variant_key: c.variant_key,
      media_url: c.media_url,
    }));
  if (subset.length === 0) return [];
  return partitionByObjectAffinity(subset, 1);
}

/** Make a fresh persisted sprite entry skeleton (mirror makeBatchSkeleton). */
export function makeSpriteSkeleton(order: number, name: string): RemixSpriteEntry {
  return { id: newUuid(), order, name, crop_sheets: [] };
}

/**
 * Seed an initial sprite (K=1, all enabled-character variants) into the insert
 * payload / remix IN PLACE when none exists. Idempotent — no-op when
 * `sprites.length >= 1`. Returns the seeded entry, or null when already seeded
 * / no cells to lay out.
 */
export function buildSeedSprite(remix: Remix): RemixSpriteEntry | null {
  if (remix.sprites.length >= 1) return null;
  const cells = groupVariantsForSprite(remix);
  if (cells.length === 0) {
    log.warn('buildSeedSprite', 'no variant cells to seed — skip', {
      remixId: remix.id,
    });
    return null;
  }
  const entry: RemixSpriteEntry = {
    ...makeSpriteSkeleton(0, 'Sprite 1'),
    crop_sheets: partitionByObjectAffinity(cells, 1),
  };
  log.info('buildSeedSprite', 'seeded', {
    remixId: remix.id,
    sheetCount: entry.crop_sheets.length,
    cellCount: cells.length,
  });
  return entry;
}

// ── Persistence helpers (sprites column) — mirror crop-sheet-layout ───────────

/** Persist the `sprites` column with the freshest in-store value, rolling back
 *  to `prevRemix` on error. Shared by add/remove/seed/relayout. */
async function persistSprites(
  deps: RelayoutDeps,
  remixId: string,
  prevRemix: Remix,
  action: string,
): Promise<boolean> {
  const { set, get } = deps;
  const remixAfter = get().remixes.find((r) => r.id === remixId);
  if (!remixAfter) {
    log.warn(action, 'remix gone before persist — skip', { remixId });
    return false;
  }
  const { error } = await supabase
    .from('remixes')
    .update({ sprites: remixAfter.sprites })
    .eq('id', remixId);
  if (error) {
    log.error(action, 'persist failed — rollback', { remixId, error: error.message });
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
    }));
    return false;
  }
  return true;
}

/**
 * Re-layouts ALL sheets of ONE sprite at `currentSheetCount + delta`, clamped to
 * `[SHEET_MIN, SHEET_MAX]`. Re-packs the sprite's OWN cells (pre-swap
 * `sheet.crops[]`, scoped to the sprite — subset sprites carry a subset).
 *
 * SWAP-RESULTS CONTRACT (callers MUST gate): a successful re-layout REBUILDS the
 * sprite's sheets (swap_results cleared — stale geometry). Caller gates on
 * existing swap_results (confirm dialog).
 *
 * Returns false on guard hit (missing remix/sprite, no-op count, empty cells,
 * persist error rolled back); true after persist.
 */
export async function relayoutSpriteSheets(
  deps: RelayoutDeps,
  remixId: string,
  spriteId: string,
  delta: number,
): Promise<boolean> {
  const { set, get } = deps;
  log.info('relayoutSpriteSheets', 'start', { remixId, spriteId, delta });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('relayoutSpriteSheets', 'remix not found — abort', { remixId });
    return false;
  }
  const sprite = prevRemix.sprites.find((s) => s.id === spriteId);
  if (!sprite) {
    log.warn('relayoutSpriteSheets', 'sprite not found — abort', { remixId, spriteId });
    return false;
  }

  const currentCount = sprite.crop_sheets.length;
  const nextCount = Math.min(SHEET_MAX, Math.max(SHEET_MIN, currentCount + delta));
  if (nextCount === currentCount) {
    log.debug('relayoutSpriteSheets', 'no count change — skip', {
      remixId,
      spriteId,
      currentCount,
    });
    return false;
  }

  // Re-pack the sprite's own cells (ORIGINAL artwork carried on the crops).
  const cells: SpriteCell[] = currentCellsOfSprite(sprite).map((c) => ({
    type: c.type,
    object_key: c.object_key,
    variant_key: c.variant_key,
    media_url: c.media_url,
  }));
  if (cells.length === 0) {
    log.warn('relayoutSpriteSheets', 'no cells to layout — abort', { remixId, spriteId });
    return false;
  }
  const newSheets = partitionByObjectAffinity(cells, nextCount);

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId
        ? {
            ...r,
            sprites: r.sprites.map((sp) =>
              sp.id === spriteId ? { ...sp, crop_sheets: newSheets } : sp,
            ),
          }
        : r,
    ),
  }));

  log.debug('relayoutSpriteSheets', 'optimistic replaceAll', {
    remixId,
    spriteId,
    currentCount,
    nextCount,
    cellCount: cells.length,
  });

  const ok = await persistSprites(deps, remixId, prevRemix, 'relayoutSpriteSheets');
  if (ok) log.info('relayoutSpriteSheets', 'done', { remixId, spriteId, nextCount });
  return ok;
}

/**
 * Append a NEW sprite as a SUBSET clone of the active sprite (modal "Add as
 * Sprite" with per-cell selection). `selectedCellKeys` = cellKeys picked off the
 * active sprite's pre-swap crops. K=1 sheet from the subset; ordered
 * `max(order)+1`. Optimistic push + `sprites` persist with rollback.
 *
 * Throws on empty selection / zero match (stale keys). Returns the new sprite
 * id on persist success, null on guard miss / persist failure.
 */
export async function addSprite(
  deps: RelayoutDeps,
  remixId: string,
  activeSpriteId: string,
  selectedCellKeys: ReadonlySet<string>,
): Promise<string | null> {
  const { set, get } = deps;
  log.info('addSprite', 'start', {
    remixId,
    activeSpriteId,
    selectionSize: selectedCellKeys.size,
  });

  if (selectedCellKeys.size === 0) {
    log.warn('addSprite', 'empty selection — throw', { remixId, activeSpriteId });
    throw new Error('addSprite requires a non-empty cell selection');
  }

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('addSprite', 'remix not found — abort', { remixId });
    return null;
  }

  const activeSprite =
    prevRemix.sprites.find((s) => s.id === activeSpriteId) ?? prevRemix.sprites[0];
  if (!activeSprite) {
    log.warn('addSprite', 'no active sprite — abort', { remixId, activeSpriteId });
    return null;
  }

  const newSheets = addSpriteSubset(activeSprite, selectedCellKeys);
  if (newSheets.length === 0) {
    log.warn('addSprite', 'selection has zero matches in active sprite — throw', {
      remixId,
      activeSpriteId,
      selectionSize: selectedCellKeys.size,
    });
    throw new Error(
      'addSprite: selection does not match any cell of the active sprite (stale)',
    );
  }

  const order = prevRemix.sprites.reduce((max, s) => Math.max(max, s.order), -1) + 1;
  const newSprite: RemixSpriteEntry = {
    ...makeSpriteSkeleton(order, `Sprite ${prevRemix.sprites.length + 1}`),
    crop_sheets: newSheets,
  };

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId ? { ...r, sprites: [...r.sprites, newSprite] } : r,
    ),
  }));

  log.debug('addSprite', 'optimistic push', {
    remixId,
    spriteId: newSprite.id,
    order,
    sheetCount: newSprite.crop_sheets.length,
  });

  const ok = await persistSprites(deps, remixId, prevRemix, 'addSprite');
  if (!ok) return null;
  log.info('addSprite', 'done', { remixId, spriteId: newSprite.id });
  return newSprite.id;
}

/**
 * Remove a sprite by id. Guarded so the last sprite cannot be removed
 * (`sprites.length > SPRITE_MIN`). Optimistic filter + `sprites` persist with
 * rollback. Returns true on success.
 */
export async function removeSprite(
  deps: RelayoutDeps,
  remixId: string,
  spriteId: string,
): Promise<boolean> {
  const { set, get } = deps;
  log.info('removeSprite', 'start', { remixId, spriteId });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('removeSprite', 'remix not found — abort', { remixId });
    return false;
  }
  if (!prevRemix.sprites.some((s) => s.id === spriteId)) {
    log.warn('removeSprite', 'sprite not found — abort', { remixId, spriteId });
    return false;
  }
  if (prevRemix.sprites.length <= SPRITE_MIN) {
    log.warn('removeSprite', 'cannot remove last sprite — abort', {
      remixId,
      spriteId,
      count: prevRemix.sprites.length,
    });
    return false;
  }

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId
        ? { ...r, sprites: r.sprites.filter((sp) => sp.id !== spriteId) }
        : r,
    ),
  }));

  log.debug('removeSprite', 'optimistic remove', { remixId, spriteId });
  return persistSprites(deps, remixId, prevRemix, 'removeSprite');
}

/**
 * Seed an initial sprite into a remix when none exists (lazy, modal-mount).
 * Idempotent — no-op (returns false) when the remix already has ≥1 sprite or
 * there are no variant cells. Optimistic push + persist with rollback.
 */
export async function seedInitialSpriteIfMissing(
  deps: RelayoutDeps,
  remixId: string,
): Promise<boolean> {
  const { set, get } = deps;
  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('seedInitialSpriteIfMissing', 'remix not found — skip', { remixId });
    return false;
  }
  if (prevRemix.sprites.length >= 1) {
    log.debug('seedInitialSpriteIfMissing', 'sprite already present — skip', {
      remixId,
      spriteCount: prevRemix.sprites.length,
    });
    return false;
  }
  const entry = buildSeedSprite(prevRemix);
  if (!entry) return false;

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId ? { ...r, sprites: [entry] } : r,
    ),
  }));

  log.info('seedInitialSpriteIfMissing', 'optimistic seed', {
    remixId,
    spriteId: entry.id,
  });
  return persistSprites(deps, remixId, prevRemix, 'seedInitialSpriteIfMissing');
}
