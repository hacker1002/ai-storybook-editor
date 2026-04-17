// trim-guide-overlay.tsx - Advisory trim guide overlay (editor only)
// ⚡ ADR-023: Canvas [0, 100] = full bleed (tờ giấy vật lý). Trim = advisory dashed rect INSIDE canvas.
// Content outside the dashed line may be cut when printing.
// pointer-events: none — never blocks editor interactions.

interface TrimGuideOverlayProps {
  trimPct: { x: number; y: number };
}

/**
 * Renders a dashed rect at [trimPct, 100-trimPct] inside the full bleed canvas.
 * Absolute-positioned, inset as percentage — no dependency on scaled pixel dimensions.
 */
export function TrimGuideOverlay({ trimPct }: TrimGuideOverlayProps) {
  if (trimPct.x <= 0 || trimPct.y <= 0) return null;

  return (
    <div
      title="Content outside the dashed line may be cut when printing"
      style={{
        position: 'absolute',
        top: `${trimPct.y}%`,
        right: `${trimPct.x}%`,
        bottom: `${trimPct.y}%`,
        left: `${trimPct.x}%`,
        border: '1.5px dashed rgba(255, 150, 0, 0.65)',
        pointerEvents: 'none',
        zIndex: 800,
      }}
    />
  );
}
