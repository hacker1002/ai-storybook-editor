/** Pure canvas utilities for EraseImageModal — exported separately for unit testing (react-refresh/only-export-components). */

export const BRUSH_PX = { S: 8, M: 16, L: 32 } as const;

export interface Stroke {
  points: { x: number; y: number }[];
  size: "S" | "M" | "L";
  color: string;
}

export function norm(x: number, y: number, w: number, h: number) {
  return { x: x / w, y: y / h };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Renders all strokes onto a canvas context. brushScale > 1 for natural-resolution export.
 *  clearFirst=true (default) wipes the canvas before painting — correct for live overlay
 *  which re-renders from scratch each frame. Pass false when compositing strokes ON TOP
 *  of existing content (e.g. export pipeline after drawImage). */
export function paintStrokesOnCtx(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  activeStroke: Stroke | null,
  canvasW: number,
  canvasH: number,
  brushScale = 1,
  clearFirst = true
) {
  if (clearFirst) ctx.clearRect(0, 0, canvasW, canvasH);
  for (const stroke of [...strokes, activeStroke].filter(Boolean) as Stroke[]) {
    if (stroke.points.length === 0) continue;
    const radius = BRUSH_PX[stroke.size] * brushScale;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = radius * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
}
