// trim-bleed-overlay.tsx - Visual guide showing bleed edge (dashed) and trim edge (solid)
// Rendered as absolute overlay extending outside the trim canvas into the bleed zone.
// pointer-events: none so it never blocks editor interactions.

interface TrimBleedOverlayProps {
  bleedPct: { x: number; y: number };
  scaledCanvasWidth: number;
  scaledCanvasHeight: number;
}

export function TrimBleedOverlay({ bleedPct, scaledCanvasWidth, scaledCanvasHeight }: TrimBleedOverlayProps) {
  const bleedPx = (bleedPct.x / 100) * scaledCanvasWidth;
  const bleedPy = (bleedPct.y / 100) * scaledCanvasHeight;

  if (bleedPx <= 0 || bleedPy <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: -bleedPy,
        right: -bleedPx,
        bottom: -bleedPy,
        left: -bleedPx,
        pointerEvents: 'none',
        zIndex: 800,
      }}
    >
      {/* Outer border = bleed edge */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '1.5px dashed rgba(255, 150, 0, 0.65)',
        }}
      />
      {/* Inner border = trim edge */}
      <div
        style={{
          position: 'absolute',
          top: bleedPy,
          right: bleedPx,
          bottom: bleedPy,
          left: bleedPx,
          border: '1px solid rgba(0, 0, 0, 0.2)',
        }}
      />
    </div>
  );
}
