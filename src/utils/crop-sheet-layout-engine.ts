// crop-sheet-layout-engine.ts — Pure layout engine for crop sheets.
//
// Computes how a list of crops (images of one key — character/prop/mix) packs
// onto K crop sheets. Each sheet shrink-wraps its content, picks an optimal
// aspect ratio from a discrete allowed set (landscape-preferred), minimizing
// wasted area. Output is real pixels (relative to the spread) ready to persist
// straight into `crop_sheets[]`.
//
// Spec: ai-storybook-design/component/editor-page/remix-creative-space/05-05-crop-sheet-layout-engine.md
//
// PURE: no side-effects, no I/O, no React, no logger. Deterministic — same
// input yields same output (stable sort). Callers (crop-grouping util / remix
// store) own logging of bad input; this engine filters silently.
//
// potpack is FORKED INLINE here: the stock npm `potpack` only accepts
// `boxes[]` and self-sorts by `max(w,h)`. The engine needs strip-packing with a
// fixed `startWidth` seed plus 4 distinct sort keys (spec §5.4). Forking inline
// keeps the algorithm under our control and avoids adding an npm dependency.

// ── Public types (engine input/output contract) ─────────────────────────────

/** 1 crop = 1 image, geometry relative (%) to the spread. */
export interface CropInput {
  /** layer/crop id — opaque, echoed verbatim into output. */
  id: string;
  /** (0, 100] — width as % of spread width. */
  widthPct: number;
  /** (0, 100] — height as % of spread height. */
  heightPct: number;
  /** Primary subject affinity key (= `tags[0].object_key`). Metadata only —
   *  NOT used by packing; only groups crops of the same entity onto one sheet
   *  via `partitionByEntityAffinity`. Undefined → falls in the `'__none__'`
   *  cluster. */
  objectKey?: string;
}

export interface LayoutConfig {
  /** K — number of sheets requested (clamped to ≥ 1). */
  sheetCount: number;
  /** Real spread size (px) — DIMENSION_CANVAS_SIZE[book.dimension] ?? DEFAULT_CANVAS_SIZE. */
  spread: { width: number; height: number };
  /** Horizontal padding (px) on EACH side of a crop. Default DEFAULTS.gutterX.
   *  The gap between two horizontally-adjacent crops is therefore 2·gutterX. */
  gutterX?: number;
  /** Vertical padding (px) on EACH side of a crop. Default DEFAULTS.gutterY.
   *  The gap between two vertically-adjacent crops is therefore 2·gutterY. */
  gutterY?: number;
  /** τ — landscape-ratio preference threshold. Default DEFAULTS.landscapeTolerance. */
  landscapeTolerance?: number;
  /** When true, input order wins every tie the packing pipeline would
   *  otherwise break arbitrarily: (a) `partitionByEntityAffinity` assigns
   *  entity clusters to sheets in first-APPEARANCE order instead of
   *  total-area-desc, and (b) potpack breaks EQUAL-size-metric ties by input
   *  index instead of id-alphabetical — so uniformly-sized crops are placed
   *  top-left → bottom-right in `crops[]` order. Packing of unequal boxes
   *  stays size-sorted (fill optimization untouched). Default false — the
   *  mix/Batches plane never sets it → byte-identical output there. */
  preserveInputOrder?: boolean;
}

/** Crop position + size within a sheet — px, integer, sheet-relative. */
export interface CropPlacement {
  id: string;
  geometry: { x: number; y: number; w: number; h: number };
}

export interface SheetLayout {
  /** 0-based. */
  index: number;
  /** '16:9' | '4:3' | … — one of ALLOWED_RATIOS. */
  ratioKey: string;
  /** W/H for ratioKey. */
  ratio: number;
  /** [0,1] — fill ratio; wasted area = 1 − fill. */
  fill: number;
  /** px, integer — outer sheet frame size. */
  sheetGeometry: { width: number; height: number };
  /** Empty when no crop was assigned to this sheet (K > N). */
  placements: CropPlacement[];
}

export interface CropSheetLayoutResult {
  /** length === clamp(config.sheetCount, 1, ∞). */
  sheets: SheetLayout[];
}

export type Orientation = 'landscape' | 'portrait' | 'square';

// ── Mapping constants (verbatim from spec §4) ────────────────────────────────

/** 10 allowed ratios — a sheet must be exactly one of these. */
export const ALLOWED_RATIOS: { key: string; value: number; orientation: Orientation }[] = [
  { key: '21:9', value: 21 / 9, orientation: 'landscape' },
  { key: '16:9', value: 16 / 9, orientation: 'landscape' },
  { key: '3:2', value: 3 / 2, orientation: 'landscape' },
  { key: '4:3', value: 4 / 3, orientation: 'landscape' },
  { key: '5:4', value: 5 / 4, orientation: 'landscape' },
  { key: '1:1', value: 1, orientation: 'square' },
  { key: '4:5', value: 4 / 5, orientation: 'portrait' },
  { key: '3:4', value: 3 / 4, orientation: 'portrait' },
  { key: '2:3', value: 2 / 3, orientation: 'portrait' },
  { key: '9:16', value: 9 / 16, orientation: 'portrait' },
];

export const DEFAULTS = {
  // Asymmetric padding around each crop (px). gutterX > gutterY widens the
  // horizontal gap (2·gutterX = 64px between adjacent crops) so the per-crop
  // index badge fits in the left separating strip WITHOUT being clipped or
  // overlapping the neighbour; the vertical gap stays tighter (2·gutterY =
  // 16px). See spec 05-05 §5.3.
  gutterX: 32, // horizontal padding each side → 64px horizontal gap
  gutterY: 8, // vertical padding each side → 16px vertical gap
  // Extra LEFT-only margin (px) added on top of gutterX for the first column,
  // so the per-crop index badge (rendered in the left strip, translated fully
  // out of the cell) fits 2-digit ordinals (≥10) without clipping. Applied as a
  // uniform +x shift on every placement plus an equal widening of the sheet, so
  // inter-crop gaps, vertical spacing and the right margin stay unchanged.
  // left margin = gutterX + marginLeftExtra = 32 + 32 = 64px.
  marginLeftExtra: 32,
  landscapeTolerance: 0.08, // τ — accept landscape ratio if ≤ 8% worse than global best
  fillTarget: 0.95, // slack factor when seeding potpack bin width
};

/** potpack multi-sort keys (spec §5.4). */
export const SORT_KEYS = ['height', 'width', 'area', 'maxSide'] as const;
type SortKey = (typeof SORT_KEYS)[number];

// ── Internal box / packing types ─────────────────────────────────────────────

interface PxCrop {
  id: string;
  w: number;
  h: number;
  /** Position in the sanitized input array — potpack tie-break rank when
   *  `preserveInputOrder` is on. */
  inputIndex: number;
  /** Primary subject affinity key — echoed from CropInput.objectKey. */
  objectKey?: string;
}

/** A box being packed — potpack mutates `x`/`y` in place. */
interface PackBox {
  id: string;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Input-order tie-break rank. ONLY set when `preserveInputOrder` — its
   *  presence switches potpack's equal-metric tie-break from id-alphabetical
   *  to input order (absence keeps the mix plane byte-identical). */
  order?: number;
}

interface PackResult {
  w: number;
  h: number;
  boxes: PackBox[];
}

interface Space {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Candidate {
  key: string;
  R: number;
  orientation: Orientation;
  W: number;
  H: number;
  fill: number;
  packed: PackResult;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the crop sheet layout for one key's crops over `sheetCount` sheets.
 * Pure, deterministic. Throws only on invalid spread (a config error the
 * caller must resolve via DIMENSION_CANVAS_SIZE / DEFAULT_CANVAS_SIZE).
 */
export function computeCropSheetLayout(
  crops: CropInput[],
  config: LayoutConfig,
): CropSheetLayoutResult {
  const { spread } = config;
  if (spread.width <= 0 || spread.height <= 0) {
    throw new Error(
      `computeCropSheetLayout: invalid spread ${spread.width}×${spread.height} — caller must resolve a valid canvas size`,
    );
  }

  const sheetCount = Math.max(1, Math.floor(config.sheetCount));
  const gutterX = config.gutterX ?? DEFAULTS.gutterX;
  const gutterY = config.gutterY ?? DEFAULTS.gutterY;
  const landscapeTolerance = config.landscapeTolerance ?? DEFAULTS.landscapeTolerance;
  const preserveInputOrder = config.preserveInputOrder ?? false;

  // Silently drop crops with non-positive dimensions (caller logs warnings).
  const sanitized = crops.filter((c) => c.widthPct > 0 && c.heightPct > 0);
  const pxCrops = toPixels(sanitized, spread);
  const groups = partitionByEntityAffinity(pxCrops, sheetCount, preserveInputOrder);

  const sheets = groups.map((group, index) =>
    packOneSheet(group, index, gutterX, gutterY, landscapeTolerance, preserveInputOrder),
  );

  return { sheets };
}

// ── Step 1: % → real pixels (spec §5.1) ──────────────────────────────────────

function toPixels(crops: CropInput[], spread: { width: number; height: number }): PxCrop[] {
  return crops.map((c, i) => ({
    id: c.id,
    w: (c.widthPct / 100) * spread.width,
    h: (c.heightPct / 100) * spread.height,
    inputIndex: i,
    objectKey: c.objectKey,
  }));
}

// ── Step 2: partition into K buckets — entity affinity (spec §5.2) ───────────

const NONE_CLUSTER = '__none__';

/**
 * Partition crops into K sheets, keeping crops of the same entity (objectKey)
 * on the same sheet where possible. Each whole entity cluster is assigned to
 * the smallest-area bucket; an oversized cluster (area > budget, >1 crop) is
 * split crop-by-crop into the smallest buckets (simple heuristic — engine §9
 * open, rare). Deterministic: clusters keep first-appearance order, sorted by
 * (total area desc, appearance order asc); ties pick the lowest bucket index.
 * With `preserveInputOrder` the area-desc sort is skipped — clusters are
 * bucketed in pure appearance order (assignment mechanics unchanged).
 */
function partitionByEntityAffinity(
  pxCrops: PxCrop[],
  k: number,
  preserveInputOrder: boolean,
): PxCrop[][] {
  if (k <= 1) return [pxCrops];

  // Group by objectKey, preserving first-appearance order.
  const order: string[] = [];
  const clusters = new Map<string, PxCrop[]>();
  for (const crop of pxCrops) {
    const ck = crop.objectKey ?? NONE_CLUSTER;
    let bucket = clusters.get(ck);
    if (!bucket) {
      bucket = [];
      clusters.set(ck, bucket);
      order.push(ck);
    }
    bucket.push(crop);
  }

  const buckets: PxCrop[][] = Array.from({ length: k }, () => []);
  const bucketArea: number[] = new Array(k).fill(0);
  const areaOf = (c: PxCrop) => c.w * c.h;
  const totalArea = pxCrops.reduce((s, c) => s + areaOf(c), 0);
  const budget = totalArea / k;

  // Smallest-area bucket; tie-break lowest index — deterministic.
  const smallestBucket = (): number => {
    let target = 0;
    for (let i = 1; i < k; i++) {
      if (bucketArea[i] < bucketArea[target]) target = i;
    }
    return target;
  };

  // Sort clusters by total area desc, tie-break appearance order asc — unless
  // the caller asked to preserve input order (appearance order as-is).
  const clusterArea = (ck: string) => clusters.get(ck)!.reduce((s, c) => s + areaOf(c), 0);
  const appearance = new Map(order.map((ck, i) => [ck, i]));
  const sorted = preserveInputOrder
    ? order
    : [...order].sort((a, b) => {
        const diff = clusterArea(b) - clusterArea(a);
        if (diff !== 0) return diff;
        return appearance.get(a)! - appearance.get(b)!;
      });

  for (const ck of sorted) {
    const cluster = clusters.get(ck)!;
    const cArea = clusterArea(ck);
    if (cArea > budget && cluster.length > 1) {
      // Oversized entity — spread its crops across the smallest buckets.
      for (const crop of cluster) {
        const target = smallestBucket();
        buckets[target].push(crop);
        bucketArea[target] += areaOf(crop);
      }
    } else {
      // Keep the whole cluster together on one sheet.
      const target = smallestBucket();
      buckets[target].push(...cluster);
      bucketArea[target] += cArea;
    }
  }
  return buckets;
}

// ── Step 3: pack one sheet — enumerate 10 ratios (spec §5.3) ──────────────────

function packOneSheet(
  group: PxCrop[],
  index: number,
  gutterX: number,
  gutterY: number,
  landscapeTolerance: number,
  preserveInputOrder: boolean,
): SheetLayout {
  if (group.length === 0) {
    return {
      index,
      ratioKey: '1:1',
      ratio: 1,
      fill: 0,
      sheetGeometry: { width: 0, height: 0 },
      placements: [],
    };
  }

  // Inflate each crop by 2*gutterX horizontally / 2*gutterY vertically
  // (asymmetric padding around the crop). `order` only under
  // preserveInputOrder — its presence flips potpack's tie-break.
  const inflated: PackBox[] = group.map((c) => ({
    id: c.id,
    w: c.w + 2 * gutterX,
    h: c.h + 2 * gutterY,
    x: 0,
    y: 0,
    ...(preserveInputOrder ? { order: c.inputIndex } : {}),
  }));
  const totalArea = inflated.reduce((sum, b) => sum + b.w * b.h, 0);
  // Widest inflated box — the bin width MUST never seed below this, else a box
  // wider than `startWidth` matches no strip space, is never placed, and keeps
  // its init (0,0) → overlapping placements + a corrupt sheetGeometry (CRIT-1).
  const maxBoxW = inflated.reduce((m, b) => Math.max(m, b.w), 0);

  const candidates: Candidate[] = [];
  for (const { key, value: R, orientation } of ALLOWED_RATIOS) {
    // Seed bin width biased toward ratio R, floored at the widest box so every
    // box is guaranteed a fitting strip space (see `potpack` contract).
    const startWidth = Math.max(
      maxBoxW,
      Math.sqrt((totalArea * R) / DEFAULTS.fillTarget),
    );
    const packed = potpackMultiSort(inflated, startWidth);
    // Snap content bbox up to exactly ratio R (only grow, never crop).
    const H = Math.max(packed.h, packed.w / R);
    const W = R * H;
    candidates.push({
      key,
      R,
      orientation,
      W,
      H,
      fill: W * H > 0 ? totalArea / (W * H) : 0,
      packed,
    });
  }

  const best = pickByPreference(candidates, landscapeTolerance);
  return toSheetLayout(best, index, gutterX, gutterY);
}

// ── Step 4: forked potpack — strip-packing + guillotine split (spec §5.4) ────

/**
 * Forked potpack — strip-packing into a fixed-width, infinite-height bin with
 * guillotine free-space splitting. Does NOT rotate boxes. Mutates `box.x/y`.
 *
 * CONTRACT: `startWidth` MUST be ≥ the widest box (see `packOneSheet` —
 * `Math.max(maxBoxW, ...)`). Under that contract the seed space
 * `{w: startWidth, h: ∞}` fits every box, so every box is always placed. The
 * `placed` guard below is a defensive fail-safe: a never-placed box would keep
 * its init (0,0) and silently corrupt placements + sheetGeometry. If it ever
 * fires we drop the box onto a fresh full-width row instead of leaving it at
 * the origin (still deterministic, geometry stays consistent).
 */
function potpack(boxes: PackBox[], startWidth: number, sortKey: SortKey): PackResult {
  // Sort descending by sortKey. Tie-break: input order ascending when carried
  // (`preserveInputOrder` boxes — equal-size cells place in crops[] order so
  // ordinal badges read top-left → bottom-right), else id ascending —
  // deterministic either way.
  boxes.sort((a, b) => {
    const diff = sortMetric(b, sortKey) - sortMetric(a, sortKey);
    if (diff !== 0) return diff;
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // One space, infinite height → strip packing. Width floored to fit the
  // widest box (defensive — caller already guarantees the floor).
  const binWidth = Math.max(startWidth, ...boxes.map((b) => b.w));
  const spaces: Space[] = [{ x: 0, y: 0, w: binWidth, h: Infinity }];
  // Bottom of the lowest fresh row — fallback placement target for the
  // (should-be-impossible) never-fits case.
  let stripBottom = 0;

  for (const box of boxes) {
    let placed = false;
    // Scan from the end — find the first space that fits the box.
    for (let i = spaces.length - 1; i >= 0; i--) {
      const space = spaces[i];
      if (box.w > space.w || box.h > space.h) continue;
      placed = true;

      // Place box at the space's top-left corner.
      box.x = space.x;
      box.y = space.y;

      // Guillotine split the space into ≤ 2 children.
      if (box.w === space.w && box.h === space.h) {
        // Exact fit — consume the space.
        const last = spaces.pop()!;
        if (i < spaces.length) spaces[i] = last;
      } else if (box.h === space.h) {
        // Box fills height — shrink space from the left.
        space.x += box.w;
        space.w -= box.w;
      } else if (box.w === space.w) {
        // Box fills width — shrink space from the top.
        space.y += box.h;
        space.h -= box.h;
      } else {
        // Split into a right space + a bottom space.
        spaces.push({
          x: space.x + box.w,
          y: space.y,
          w: space.w - box.w,
          h: box.h,
        });
        space.y += box.h;
        space.h -= box.h;
      }
      stripBottom = Math.max(stripBottom, box.y + box.h);
      break;
    }

    // Defensive fail-safe — unreachable under the startWidth ≥ maxBoxW
    // contract. Place the box on a fresh full-width row below all content so
    // it never overlaps and never keeps its init (0,0).
    if (!placed) {
      box.x = 0;
      box.y = stripBottom;
      stripBottom += box.h;
      if (box.w < binWidth) {
        spaces.push({
          x: box.w,
          y: box.y,
          w: binWidth - box.w,
          h: box.h,
        });
      }
    }
  }

  let w = 0;
  let h = 0;
  for (const box of boxes) {
    w = Math.max(w, box.x + box.w);
    h = Math.max(h, box.y + box.h);
  }
  return { w, h, boxes };
}

function sortMetric(box: PackBox, sortKey: SortKey): number {
  switch (sortKey) {
    case 'height':
      return box.h;
    case 'width':
      return box.w;
    case 'area':
      return box.w * box.h;
    case 'maxSide':
      return Math.max(box.w, box.h);
  }
}

/**
 * Run potpack for all 4 sort keys, keep the result with the highest fill.
 * Clones `boxes` per sort key — potpack mutates box positions.
 */
function potpackMultiSort(boxes: PackBox[], startWidth: number): PackResult {
  let best: PackResult | null = null;
  let bestFill = -1;

  for (const sortKey of SORT_KEYS) {
    const cloned: PackBox[] = boxes.map((b) => ({ ...b }));
    const result = potpack(cloned, startWidth, sortKey);
    const boxArea = result.boxes.reduce((sum, b) => sum + b.w * b.h, 0);
    const fill = result.w * result.h > 0 ? boxArea / (result.w * result.h) : 0;
    if (fill > bestFill) {
      bestFill = fill;
      best = result;
    }
  }
  // SORT_KEYS is non-empty → best is always assigned.
  return best!;
}

// ── Step 5: pick ratio — landscape preference (spec §5.5) ────────────────────

function pickByPreference(candidates: Candidate[], tolerance: number): Candidate {
  const bestAll = candidates.reduce((best, c) => (c.fill > best.fill ? c : best));
  const landscapes = candidates.filter((c) => c.orientation === 'landscape');
  if (landscapes.length > 0) {
    const bestLand = landscapes.reduce((best, c) => (c.fill > best.fill ? c : best));
    if (bestLand.fill >= bestAll.fill - tolerance) return bestLand;
  }
  return bestAll;
}

// ── Step 6: emit real pixels (spec §5.6) ─────────────────────────────────────

function toSheetLayout(
  best: Candidate,
  index: number,
  gutterX: number,
  gutterY: number,
): SheetLayout {
  // Shift every crop right by the extra left margin; widen the sheet by the
  // same amount so only the LEFT margin grows (right margin / gaps unchanged).
  const marginLeft = DEFAULTS.marginLeftExtra;

  const placements: CropPlacement[] = best.packed.boxes.map((box) => ({
    id: box.id,
    geometry: {
      x: Math.round(box.x + gutterX + marginLeft),
      y: Math.round(box.y + gutterY),
      // Clamp ≥ 1px — gutter larger than the crop would yield ≤ 0 (spec §8).
      w: Math.max(1, Math.round(box.w - 2 * gutterX)),
      h: Math.max(1, Math.round(box.h - 2 * gutterY)),
    },
  }));

  return {
    index,
    ratioKey: best.key,
    ratio: best.R,
    fill: best.fill,
    sheetGeometry: { width: Math.round(best.W + marginLeft), height: Math.round(best.H) },
    placements,
  };
}
