// zoom-area-overlay-utils.ts — Pure helpers for ZoomAreaOverlay + DrawZoomAreaSurface

export interface ZoomAreaGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';

export const ZOOM_OVERLAY = {
  MIN_ZOOM_AREA_PCT: 10,
  MIN_DRAG_SIZE_PCT: 5,
  HANDLE_RADIUS_PX: 6,
  HANDLE_RADIUS_SELECTED_PX: 8,
  BORDER_WIDTH_PX: 1.5,
  BORDER_WIDTH_SELECTED_PX: 2.5,
  COLOR: '#2196F3',
  FILL_UNSELECTED: 'rgba(33, 150, 243, 0.04)',
  FILL_SELECTED: 'rgba(33, 150, 243, 0.12)',
  LABEL_FONT_SIZE_PX: 12,
  LABEL_BG_COLOR: '#3730A3', // indigo-700; matches selected-state pill in design
  LABEL_TEXT_COLOR: '#FFFFFF',
  LABEL_PADDING_X: 8,
  LABEL_PADDING_Y: 4,
  LABEL_RADIUS: 4,
} as const;

export const HANDLE_IDS: HandleId[] = ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampToBounds(g: ZoomAreaGeometry): ZoomAreaGeometry {
  const w = Math.min(100, Math.max(0, g.w));
  const h = Math.min(100, Math.max(0, g.h));
  return {
    x: clamp(g.x, 0, Math.max(0, 100 - w)),
    y: clamp(g.y, 0, Math.max(0, 100 - h)),
    w,
    h,
  };
}

// `spreadRatio` param kept for signature stability (callers pass it through).
// Aspect lock = spread aspect → in percentage space (w/spreadW, h/spreadH),
// that means w_pct = h_pct. Hence ratio coupling is the IDENTITY here, not
// a multiplication by spreadRatio (which would give pixel ratio = spreadRatio²).
export function enforceMinSize(g: ZoomAreaGeometry, _spreadRatio: number): ZoomAreaGeometry {
  void _spreadRatio;
  const min = ZOOM_OVERLAY.MIN_ZOOM_AREA_PCT;
  let { x, y, w, h } = g;
  if (w < min) {
    w = min;
    h = w;
  }
  if (h < min) {
    h = min;
    w = h;
  }
  return { x, y, w, h };
}

export function computeMove(
  geomAtStart: ZoomAreaGeometry,
  pointerStartPx: { x: number; y: number },
  pointerCurrentPx: { x: number; y: number },
  spreadW: number,
  spreadH: number,
): ZoomAreaGeometry {
  if (spreadW <= 0 || spreadH <= 0) return geomAtStart;
  const deltaX = ((pointerCurrentPx.x - pointerStartPx.x) / spreadW) * 100;
  const deltaY = ((pointerCurrentPx.y - pointerStartPx.y) / spreadH) * 100;
  return clampToBounds({
    x: geomAtStart.x + deltaX,
    y: geomAtStart.y + deltaY,
    w: geomAtStart.w,
    h: geomAtStart.h,
  });
}

/**
 * Resize geometry from a handle drag, with strict aspect ratio lock to SPREAD aspect.
 * In percentage space (x,w as % of spreadW, y,h as % of spreadH) this lock collapses
 * to w_pct = h_pct — the spreadRatio cancels out because percentages are already
 * normalized against different bases (CSS `width%` vs `height%`).
 *
 * Anchor (corner/edge opposite to handle) is preserved.
 *
 * @param spreadRatio  spreadWidthPx / spreadHeightPx — kept for signature compat;
 *                     not used for ratio math (would give zoom_aspect = spreadRatio²).
 */
export function computeResize(
  handleId: HandleId,
  geomAtStart: ZoomAreaGeometry,
  pointerStartPx: { x: number; y: number },
  pointerCurrentPx: { x: number; y: number },
  spreadW: number,
  spreadH: number,
  spreadRatio: number,
): ZoomAreaGeometry {
  if (spreadW <= 0 || spreadH <= 0 || spreadRatio <= 0) return geomAtStart;
  const dx = ((pointerCurrentPx.x - pointerStartPx.x) / spreadW) * 100;
  const dy = ((pointerCurrentPx.y - pointerStartPx.y) / spreadH) * 100;

  let newX = geomAtStart.x;
  let newY = geomAtStart.y;
  let newW = geomAtStart.w;
  let newH = geomAtStart.h;

  switch (handleId) {
    case 'br': {
      const desiredW = geomAtStart.w + dx;
      const desiredH = geomAtStart.h + dy;
      newW = Math.max(desiredW, desiredH);
      newH = newW;
      newX = geomAtStart.x;
      newY = geomAtStart.y;
      break;
    }
    case 'tl': {
      const desiredW = geomAtStart.w - dx;
      const desiredH = geomAtStart.h - dy;
      newW = Math.max(desiredW, desiredH);
      newH = newW;
      const anchorX = geomAtStart.x + geomAtStart.w;
      const anchorY = geomAtStart.y + geomAtStart.h;
      newX = anchorX - newW;
      newY = anchorY - newH;
      break;
    }
    case 'tr': {
      const desiredW = geomAtStart.w + dx;
      const desiredH = geomAtStart.h - dy;
      newW = Math.max(desiredW, desiredH);
      newH = newW;
      const anchorY = geomAtStart.y + geomAtStart.h;
      newX = geomAtStart.x;
      newY = anchorY - newH;
      break;
    }
    case 'bl': {
      const desiredW = geomAtStart.w - dx;
      const desiredH = geomAtStart.h + dy;
      newW = Math.max(desiredW, desiredH);
      newH = newW;
      const anchorX = geomAtStart.x + geomAtStart.w;
      newX = anchorX - newW;
      newY = geomAtStart.y;
      break;
    }
    case 'r': {
      newW = geomAtStart.w + dx;
      newH = newW;
      newX = geomAtStart.x;
      newY = geomAtStart.y + (geomAtStart.h - newH) / 2;
      break;
    }
    case 'l': {
      newW = geomAtStart.w - dx;
      newH = newW;
      const anchorR = geomAtStart.x + geomAtStart.w;
      newX = anchorR - newW;
      newY = geomAtStart.y + (geomAtStart.h - newH) / 2;
      break;
    }
    case 'b': {
      newH = geomAtStart.h + dy;
      newW = newH;
      newY = geomAtStart.y;
      newX = geomAtStart.x + (geomAtStart.w - newW) / 2;
      break;
    }
    case 't': {
      newH = geomAtStart.h - dy;
      newW = newH;
      const anchorB = geomAtStart.y + geomAtStart.h;
      newY = anchorB - newH;
      newX = geomAtStart.x + (geomAtStart.w - newW) / 2;
      break;
    }
  }

  let next = enforceMinSize({ x: newX, y: newY, w: newW, h: newH }, spreadRatio);
  next = clampToBounds(next);
  return next;
}

export function cursorFor(handleId: HandleId): string {
  switch (handleId) {
    case 'tl':
    case 'br':
      return 'nwse-resize';
    case 'tr':
    case 'bl':
      return 'nesw-resize';
    case 't':
    case 'b':
      return 'ns-resize';
    case 'l':
    case 'r':
      return 'ew-resize';
  }
}

export interface RectPx {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function handlePosition(handleId: HandleId, rect: RectPx): { cx: number; cy: number } {
  switch (handleId) {
    case 'tl':
      return { cx: rect.left, cy: rect.top };
    case 'tr':
      return { cx: rect.left + rect.width, cy: rect.top };
    case 'bl':
      return { cx: rect.left, cy: rect.top + rect.height };
    case 'br':
      return { cx: rect.left + rect.width, cy: rect.top + rect.height };
    case 't':
      return { cx: rect.left + rect.width / 2, cy: rect.top };
    case 'r':
      return { cx: rect.left + rect.width, cy: rect.top + rect.height / 2 };
    case 'b':
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height };
    case 'l':
      return { cx: rect.left, cy: rect.top + rect.height / 2 };
  }
}

/**
 * Default centered geometry for Camera Zoom: 50% × 50% (pixel ratio matches spread,
 * since CSS w% and h% resolve against different bases — see `enforceMinSize` note).
 * `spreadRatio` param kept for signature compat.
 */
export function buildDefaultZoomGeometry(_spreadRatio: number): ZoomAreaGeometry {
  void _spreadRatio;
  const w = 50;
  const h = 50;
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}

/**
 * Build geometry from drag start/current pointers with ratio lock + clamp.
 * Anchor = start corner; locks w_pct = h_pct (so pixel aspect = spread aspect).
 * `spreadRatio` param kept for signature compat.
 */
export function drawRectFromPointers(
  startPct: { x: number; y: number },
  currentPct: { x: number; y: number },
  _spreadRatio: number,
): ZoomAreaGeometry {
  void _spreadRatio;
  const rawW = Math.abs(currentPct.x - startPct.x);
  const rawH = Math.abs(currentPct.y - startPct.y);
  const locked = Math.max(rawW, rawH);
  const finalX = currentPct.x >= startPct.x ? startPct.x : startPct.x - locked;
  const finalY = currentPct.y >= startPct.y ? startPct.y : startPct.y - locked;
  return clampToBounds({ x: finalX, y: finalY, w: locked, h: locked });
}
