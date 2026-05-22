// variant-icon.tsx — Inline SVG icon for the [▣] "open variants visual" button.
// Path data lives in `swap-modal-constants.ts` (VARIANT_ICON_PATH) so the modal
// HTML mockup stays the single source of truth.

import { VARIANT_ICON_PATH } from '../swap-modal-constants';

interface Props {
  className?: string;
}

export function VariantIcon({ className }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={VARIANT_ICON_PATH} />
    </svg>
  );
}
