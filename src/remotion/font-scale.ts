// remotion/font-scale.ts — single source of the render-mode font/border scale.
//
// The render frame is `compositionWidth` px wide; absolute-px typography (fontSize,
// letterSpacing) + shape borders are authored relative to the DESIGN canvas the
// live player renders against. The live player multiplies those px by
// `zoomFactor = zoomLevel/100` over a stage that is `designCanvasWidth*zoomFactor`
// wide — so the zoom-invariant on-stage fraction is `size/designCanvasWidth`.
// Multiplying by `compositionWidth/designCanvasWidth` reproduces the SAME fraction
// on the render frame ⇒ font parity (preview === output).
//
// CRITICAL: `designCanvasWidth` MUST equal the live store's `bleedCanvas.full.width`
// (ADR-023 full-bleed canvas = book trim + 2×bleed). It is NOT a fixed 800 — that
// legacy `DEFAULT_CANVAS_SIZE.width` is only correct for un-dimensioned mock spreads.
// Passing the wrong width (e.g. trim instead of full, or omitting it) silently
// scales every textbox by `realFullWidth/usedWidth` — the class of bug ADR-035's
// "parity by construction" is meant to prevent. Callers therefore pass it explicitly;
// `BookSpreadCore` warns (not throws — render still completes) when it must fall back.

/** Legacy `DEFAULT_CANVAS_SIZE.width` — last-resort fallback only (warns when used). */
export const DEFAULT_DESIGN_CANVAS_WIDTH = 800;

/**
 * @param compositionWidth  Remotion comp width in px (e.g. VIDEO_WIDTH = 1920).
 * @param designCanvasWidth Live store `bleedCanvas.full.width`. Falls back to the
 *                          legacy 800 when missing/invalid — see warning above.
 */
export function computeFontScale(
  compositionWidth: number,
  designCanvasWidth: number | undefined
): number {
  const safe =
    designCanvasWidth && designCanvasWidth > 0
      ? designCanvasWidth
      : DEFAULT_DESIGN_CANVAS_WIDTH;
  return compositionWidth / safe;
}

/** True when `canvasWidth` is a usable design width (else font scale will drift). */
export function hasValidDesignCanvasWidth(
  canvasWidth: number | undefined
): canvasWidth is number {
  return !!(canvasWidth && canvasWidth > 0);
}
