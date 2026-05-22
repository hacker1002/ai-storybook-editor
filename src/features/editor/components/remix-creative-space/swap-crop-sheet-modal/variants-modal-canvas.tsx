// variants-modal-canvas.tsx — Canvas region of VariantsVisualModal v2.
// Renders one of four branches for the active variant:
//   1. beforeUrl && afterUrl → BeforeAfterCompare slider (remount key resets pos)
//   2. only beforeUrl        → <img> + "NOT SWAPPED" badge
//   3. neither               → empty "No visual image"
//   4. isSwapping            → semi-transparent loading overlay (blocks compare)
// Extracted from variants-visual-modal.tsx to keep that file < 500 lines.

import { Loader2 } from 'lucide-react';

import { BeforeAfterCompare } from '../tabs/before-after-compare';

interface Props {
  /** Per-variant identity — remounts the compare slider so its position resets. */
  variantKey: string | null;
  beforeUrl: string | null;
  afterUrl: string | null;
  isSwapping: boolean;
  /** Active variant display label (alt text for the before-only branch). */
  variantName: string;
}

const CHECKER_BG: React.CSSProperties = {
  backgroundColor: 'var(--swap-modal-canvas-bg)',
  backgroundImage:
    'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, rgba(255,255,255,0.02) 0% 50%)',
  backgroundSize: '20px 20px',
};

const CANVAS_STYLE: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 0,
  padding: 24,
};

const BADGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
};

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: 'rgba(8, 10, 18, 0.6)',
  color: 'var(--swap-modal-text-primary)',
  fontSize: 13,
};

const MUTED_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--swap-modal-text-muted)',
};

export function VariantsModalCanvas({
  variantKey,
  beforeUrl,
  afterUrl,
  isSwapping,
  variantName,
}: Props) {
  return (
    <div style={{ ...CANVAS_STYLE, ...CHECKER_BG }}>
      {beforeUrl && afterUrl ? (
        // Remount per variant so the slider position resets on tab switch.
        <BeforeAfterCompare
          key={variantKey ?? 'compare'}
          beforeUrl={beforeUrl}
          afterUrl={afterUrl}
          matchImageAspect
        />
      ) : beforeUrl ? (
        <>
          <img
            src={beforeUrl}
            alt={variantName || 'variant'}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
          <span style={BADGE_STYLE}>NOT SWAPPED</span>
        </>
      ) : (
        <p style={MUTED_TEXT}>No visual image</p>
      )}

      {isSwapping && (
        <div style={OVERLAY_STYLE} aria-live="polite">
          <Loader2 size={28} className="animate-spin" />
          <span>Swapping…</span>
        </div>
      )}
    </div>
  );
}
