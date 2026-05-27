// lotties-tab.tsx — Lotties tab of the rev2 swap modal.
//
// PLACEHOLDER (Phase 09): the lottie auto_image swap flow is not yet specced —
// this tab renders a "Coming soon" sidebar + empty-state stage. No store calls,
// no actions. Layout mirrors the other tabs (left sidebar + center stage) so
// the modal frame stays visually consistent across the tab strip.

import { Sparkles } from 'lucide-react';
import { LEFT_SIDEBAR_WIDTH_PX } from '../swap-modal-constants';

export interface LottiesTabProps {
  remixId: string;
}

export function LottiesTab(_props: LottiesTabProps) {
  return (
    <>
      <aside
        // Dark left sidebar container — matches the other tabs' sidebar chrome.
        className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
        style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
        aria-label="Lotties"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--swap-modal-border)] px-4 py-3">
          <Sparkles
            className="h-4 w-4 text-[var(--swap-modal-text-muted)]"
            aria-hidden="true"
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
            Lotties
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Coming soon
          </p>
        </div>
      </aside>

      <section
        className="flex h-full min-w-0 flex-1 items-center justify-center bg-[var(--swap-modal-bg)] p-8 text-center"
        aria-label="Lotties stage"
      >
        <div className="flex flex-col items-center gap-2">
          <Sparkles
            className="h-10 w-10 text-[var(--swap-modal-text-muted)]"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-[var(--swap-modal-text-secondary)]">
            Lottie swap — coming soon
          </p>
          <p className="text-xs text-[var(--swap-modal-text-muted)]">
            Định nghĩa sau — sơ bộ swap auto_image (lottie)
          </p>
        </div>
      </section>
    </>
  );
}
