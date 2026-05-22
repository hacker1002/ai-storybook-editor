// variants-modal-footer.tsx — Footer region of VariantsVisualModal v2.
// Left: hint text (red error / "render again" / "swap" prompt). Right:
// [⚡ Generate] button with gating, disabled tooltip, Retry label, aria-busy.
// Extracted from variants-visual-modal.tsx to keep that file < 500 lines.

import { Loader2, Zap } from 'lucide-react';

import type { SwapPreviewState } from '@/types/remix';

interface Props {
  task: SwapPreviewState | undefined;
  afterUrl: string | null;
  canGenerate: boolean;
  isSwapping: boolean;
  /** Human-readable reason the button is disabled (tooltip). Null when enabled. */
  disabledReason: string | null;
  onGenerate: () => void;
}

const FOOTER_STYLE: React.CSSProperties = {
  height: 64,
  padding: '0 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  borderTop: '1px solid var(--swap-modal-border)',
  flex: '0 0 auto',
};

const GENERATE_BTN_STYLE = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 18px',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: 'var(--swap-modal-accent)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  whiteSpace: 'nowrap',
});

export function VariantsModalFooter({
  task,
  afterUrl,
  canGenerate,
  isSwapping,
  disabledReason,
  onGenerate,
}: Props) {
  const isError = task?.status === 'error';
  const disabled = !canGenerate || isSwapping;

  const hint = isError
    ? task?.errorMessage ?? 'Swap failed. Please retry.'
    : afterUrl
      ? 'Not satisfied? Click Generate to render again'
      : 'Generate to swap this visual variant for the selected human';

  const label = isError ? 'Retry' : 'Generate';

  return (
    <footer style={FOOTER_STYLE}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: isError ? 'var(--swap-modal-danger, #ef5350)' : 'var(--swap-modal-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hint}
      </p>

      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        aria-disabled={disabled}
        aria-busy={isSwapping}
        title={disabled && disabledReason ? disabledReason : undefined}
        style={GENERATE_BTN_STYLE(disabled)}
      >
        {isSwapping ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Zap size={16} />
        )}
        {label}
      </button>
    </footer>
  );
}
