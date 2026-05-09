// motion-line-overlay-utils.ts — Pure helpers for MotionLineOverlay (Lines effect type 16).
//
// Geometry semantics:
//   effect.geometry = TOP-LEFT destination (%) — mirrors item.geometry.w/h.
//   tipCenter (%)   = (geometry.x + geometry.w/2, geometry.y + geometry.h/2).
//   baseCenter (%)  = (item.geometry.x + item.geometry.w/2, item.geometry.y + item.geometry.h/2).

export interface MotionLineGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ItemGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointPx {
  x: number;
  y: number;
}

export interface PointPct {
  x: number;
  y: number;
}

export const MOTION_LINE_OVERLAY = {
  HIT_SLOP_PX: 8,
  SHAFT_WIDTH_SELECTED_PX: 2.5,
  SHAFT_WIDTH_UNSELECTED_PX: 1.5,
  TIP_INNER_RADIUS_PX: 6,
  TIP_OUTER_RING_RADIUS_PX: 9,
  TIP_TRIANGLE_HALF_BASE_PX: 7,
  TIP_TRIANGLE_LENGTH_PX: 12,
  // motion-paths blue (matches STAR_COLOR_MAP['motion-paths'])
  SHAFT_COLOR: '#3B82F6',
  RING_STROKE_COLOR: '#3B82F6',
  RING_STROKE_WIDTH_PX: 1.5,
  DEGENERATE_DELTA_PCT: 1,
  LABEL_FONT_SIZE_PX: 12,
  LABEL_BG_COLOR: '#3730A3',
  LABEL_TEXT_COLOR: '#FFFFFF',
  LABEL_PADDING_X: 8,
  LABEL_PADDING_Y: 4,
  LABEL_RADIUS: 4,
  LABEL_OFFSET_PX: 12,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeBaseCenterPct(item: ItemGeometry): PointPct {
  return {
    x: item.x + item.w / 2,
    y: item.y + item.h / 2,
  };
}

export function computeTipCenterPct(g: MotionLineGeometry): PointPct {
  return {
    x: g.x + g.w / 2,
    y: g.y + g.h / 2,
  };
}

export function pctToPx(pct: PointPct, spreadW: number, spreadH: number): PointPx {
  return {
    x: (pct.x / 100) * spreadW,
    y: (pct.y / 100) * spreadH,
  };
}

export function pxToPctDelta(
  pxDelta: PointPx,
  spreadW: number,
  spreadH: number,
): PointPct {
  if (spreadW <= 0 || spreadH <= 0) return { x: 0, y: 0 };
  return {
    x: (pxDelta.x / spreadW) * 100,
    y: (pxDelta.y / spreadH) * 100,
  };
}

// Convert tip center (%) to top-left geometry, clamped so the mirrored w/h box
// stays inside [0, 100] on both axes.
export function tipCenterToTopLeft(
  tipCenter: PointPct,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: clamp(tipCenter.x - w / 2, 0, Math.max(0, 100 - w)),
    y: clamp(tipCenter.y - h / 2, 0, Math.max(0, 100 - h)),
  };
}

// Self-heal: w/h MUST mirror current item.geometry.w/h on every commit so legacy
// data with stale or zero w/h gets refreshed lazily when user touches the line.
export function applySelfHeal(
  g: MotionLineGeometry,
  item: ItemGeometry,
): MotionLineGeometry {
  return {
    x: g.x,
    y: g.y,
    w: item.w,
    h: item.h,
  };
}

// Skip commit when tip ≈ base on both axes — user clicked without dragging.
export function isDegenerate(
  geometry: MotionLineGeometry,
  item: ItemGeometry,
): boolean {
  const tip = computeTipCenterPct(geometry);
  const base = computeBaseCenterPct(item);
  return (
    Math.abs(tip.x - base.x) < MOTION_LINE_OVERLAY.DEGENERATE_DELTA_PCT &&
    Math.abs(tip.y - base.y) < MOTION_LINE_OVERLAY.DEGENERATE_DELTA_PCT
  );
}

// Angle (radians) from base→tip in pixel space — used to rotate the arrow tip
// triangle so its apex points along the shaft.
export function shaftAngleRad(basePx: PointPx, tipPx: PointPx): number {
  return Math.atan2(tipPx.y - basePx.y, tipPx.x - basePx.x);
}
