// erase-stroke-engine.ts — Pure canvas stroke engine for the Erasor tab. Relocated from
// the old `erase-image-modal-utils.ts` (design 02-eraser-tab §5 "reuse, KHÔNG viết lại").
// Only change vs the original: `Stroke.size` is now a number (canvas-px radius) instead of
// a 'T'|'S'|'M'|'L' key, so `BRUSH_PX` is dropped. Exported separately for unit testing.

export type StrokeMode = 'paint' | 'erase';

export interface Stroke {
  /** Normalized 0..1 points (resolution-independent — survives canvas resize / export scale). */
  points: { x: number; y: number }[];
  /** Brush radius in canvas-px @ zoom 100% (snapshot of brushSize at draw time). Export
   *  multiplies by `brushScale = naturalW / canvas.w` to reach natural-resolution px. */
  size: number;
  mode: StrokeMode;
  /** Only consulted when mode === 'paint'. Erase strokes ignore color. */
  color: string;
}

export function norm(x: number, y: number, w: number, h: number) {
  return { x: x / w, y: y / h };
}

/** Renders all strokes onto a canvas context. `brushScale > 1` for natural-resolution
 *  export. `clearFirst=true` (default) wipes the canvas before painting — correct for
 *  overlays that re-render from scratch each frame. Pass false to composite strokes ON TOP
 *  of existing content (e.g. after drawImage in the workspace or export pipeline).
 *
 *  Erase strokes use globalCompositeOperation='destination-out' to subtract alpha from
 *  existing pixels, producing true transparency that reveals the layer below the canvas. */
export function paintStrokesOnCtx(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  activeStroke: Stroke | null,
  canvasW: number,
  canvasH: number,
  brushScale = 1,
  clearFirst = true,
) {
  if (clearFirst) ctx.clearRect(0, 0, canvasW, canvasH);
  const prevOp = ctx.globalCompositeOperation;
  for (const stroke of [...strokes, activeStroke].filter(Boolean) as Stroke[]) {
    if (stroke.points.length === 0) continue;
    const radius = stroke.size * brushScale;
    if (stroke.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      // destination-out only cares about the stroke's alpha; color value is irrelevant.
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = stroke.points.map((p) => ({ x: p.x * canvasW, y: p.y * canvasH }));

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, radius, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const mid = {
          x: (pts[i - 1].x + pts[i].x) / 2,
          y: (pts[i - 1].y + pts[i].y) / 2,
        };
        ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, mid.x, mid.y);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = prevOp;
}
