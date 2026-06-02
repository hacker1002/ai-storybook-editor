// trim-guide-overlay.tsx - Advisory trim/bleed border overlay
// ⚡ ADR-023: Canvas [0, 100] = full bleed (tờ giấy vật lý). Trim = rect INSIDE canvas
// at [trimPct, 100-trimPct]; the region OUTSIDE it (bleed) may be cut when printing.
// Content still renders through the bleed region — this is an outline only.
// pointer-events: none — never blocks interactions.
//
// Callers:
//   - Editor canvas: defaults (orange dashed advisory guide).
//   - Print export raster: white solid border, width scaled for the 300-DPI surface
//     (bakes into the exported PDF as a proof/bleed marker).

interface TrimGuideOverlayProps {
  trimPct: { x: number; y: number };
  /** CSS border color. Default: advisory orange. */
  color?: string;
  /** Border line style. Default: 'dashed' (editor). */
  borderStyle?: 'dashed' | 'solid';
  /** Border width in CSS px. Scale up for high-DPI print surfaces. Default: 1.5. */
  borderWidthPx?: number;
  /** Tooltip text. */
  title?: string;
  /** Stacking order within the canvas. Default: 800. */
  zIndex?: number;
}

/**
 * Renders a rect at [trimPct, 100-trimPct] inside the full bleed canvas.
 * Absolute-positioned, inset as percentage — no dependency on scaled pixel dimensions.
 */
export function TrimGuideOverlay({
  trimPct,
  color = 'rgba(255, 150, 0, 0.65)',
  borderStyle = 'dashed',
  borderWidthPx = 1.5,
  title = 'Content outside the dashed line may be cut when printing',
  zIndex = 800,
}: TrimGuideOverlayProps) {
  if (trimPct.x <= 0 || trimPct.y <= 0) return null;

  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        top: `${trimPct.y}%`,
        right: `${trimPct.x}%`,
        bottom: `${trimPct.y}%`,
        left: `${trimPct.x}%`,
        border: `${borderWidthPx}px ${borderStyle} ${color}`,
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
}
