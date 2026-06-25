// generate-image-modal-header.tsx — Header band for the Creating-Image workspace
// (design §3.1). Title (left) + Generate/Upload mode tablist (center) + close (right).
// Mirrors the swap modal's RemixModalHeader (tab pill group, ←/→ roving tabindex).

import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { resolveToolGate, gateTooltip } from '../image-tools-space-matrix';
import { HEADER_HEIGHT_PX } from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';
import type { GenerateModalMode } from './generate-image-modal-constants';

const log = createLogger('Editor', 'GenerateImageModalHeader');

interface GenerateImageModalHeaderProps {
  mode: GenerateModalMode;
  onModeChange: (mode: GenerateModalMode) => void;
  onClose: () => void;
  /** Per-space availability (matrix gate). `undefined` → both modes active (legacy). Modes NOT in
   *  this list still render — disabled + "Not available in this space" — mirroring the Edit/Extract
   *  tab headers (a gated-off mode stays visible, just inert). Modes have no per-mode build flag,
   *  so the gate is availability-only (never "Coming soon"). */
  enabledModes?: GenerateModalMode[];
}

interface TabDef {
  id: GenerateModalMode;
  label: string;
  Icon: typeof ImageIcon;
}

// Order is also the ←/→ keyboard navigation order.
const TABS: TabDef[] = [
  { id: 'generate', label: 'Generate', Icon: ImageIcon },
  { id: 'upload', label: 'Upload', Icon: Upload },
];

export function GenerateImageModalHeader({
  mode,
  onModeChange,
  onClose,
  enabledModes,
}: GenerateImageModalHeaderProps) {
  // Matrix gate (#1) only — modes have no per-mode build flag, so `implemented` is always true:
  // status is 'active' (available) or 'unavailable' (gated-off), never 'coming-soon'. Disabled
  // modes still render greyed (3-state, like the Edit/Extract tab headers).
  const isModeEnabled = (id: GenerateModalMode) =>
    resolveToolGate(id, enabledModes, true) === 'active';

  // ←/→ navigates only among ENABLED modes (disabled modes are skipped).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const enabled = TABS.filter((t) => isModeEnabled(t.id));
    const curIdx = enabled.findIndex((t) => t.id === mode);
    if (curIdx === -1) return;
    const nextIdx =
      e.key === 'ArrowLeft' ? Math.max(0, curIdx - 1) : Math.min(enabled.length - 1, curIdx + 1);
    if (nextIdx === curIdx) return;
    const nextId = enabled[nextIdx].id;
    log.debug('handleKeyDown', 'arrow navigate mode', { from: mode, to: nextId });
    onModeChange(nextId);
    const tabEls = e.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll('[role="tab"]:not([aria-disabled="true"])');
    const sibling = tabEls?.[nextIdx];
    if (sibling instanceof HTMLElement) sibling.focus();
  };

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <h2
        id="generate-image-modal-title"
        className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--swap-modal-text-primary)]"
      >
        Creating Image
      </h2>

      <div
        role="tablist"
        aria-label="Chế độ tạo ảnh"
        className="flex items-center gap-0.5 rounded-lg bg-[var(--swap-modal-surface-hover)] p-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const isSelected = id === mode;
          const status = resolveToolGate(id, enabledModes, true); // unavailable | active (no build gate)
          const isDisabled = status !== 'active';
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-disabled={isDisabled}
              title={gateTooltip(status)}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                if (isDisabled || id === mode) return;
                log.debug('onClick', 'mode change', { to: id });
                onModeChange(id);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors',
                isSelected
                  ? 'bg-white font-semibold text-[#0a0d18] shadow-sm'
                  : 'text-[var(--swap-modal-text-muted)] hover:text-[var(--swap-modal-text-primary)]',
                isDisabled && 'cursor-not-allowed opacity-40 hover:text-[var(--swap-modal-text-muted)]',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 justify-end">
        <button
          type="button"
          aria-label="Đóng"
          onClick={() => {
            log.debug('onClick', 'close modal');
            onClose();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
