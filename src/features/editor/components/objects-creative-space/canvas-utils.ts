// canvas-utils.ts - Pure canvas measurement helpers

import type { Typography } from "@/types/spread-types";

/** Measure required height (%) for text in a textbox of given width (%).
 *  Uses an offscreen DOM element with matching typography to get accurate line wrapping. */
export function measureTextHeightPercent(
  text: string,
  widthPercent: number,
  typography: Typography | undefined,
  canvasWidth: number,
  canvasHeight: number
): number {
  const widthPx = (widthPercent / 100) * canvasWidth;
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.visibility = 'hidden';
  el.style.width = `${widthPx}px`;
  el.style.whiteSpace = 'pre-wrap';
  el.style.padding = '4px'; // matches p-1 (0.25rem = 4px)
  el.style.fontFamily = typography?.family || 'inherit';
  el.style.fontSize = typography?.size ? `${typography.size}px` : '16px';
  el.style.fontWeight = String(typography?.weight || 'normal');
  el.style.fontStyle = typography?.style || 'normal';
  el.style.lineHeight = String(typography?.lineHeight || 1.5);
  el.style.letterSpacing = typography?.letterSpacing ? `${typography.letterSpacing}px` : 'normal';
  el.textContent = text;
  document.body.appendChild(el);
  const heightPx = el.scrollHeight;
  document.body.removeChild(el);
  return (heightPx / canvasHeight) * 100;
}
