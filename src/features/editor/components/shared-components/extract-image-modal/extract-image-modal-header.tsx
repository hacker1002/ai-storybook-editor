// extract-image-modal-header.tsx — Header band for the Extracting-Image workspace
// (design README §3.1). Title (left) + EXTRACT_TABS tablist (center, ←/→ roving tabindex,
// disabled tabs skipped + "Coming soon" tooltip) + close (right). Clone of the Generate
// header with the mode-tab swapped for the multi-tool tab registry. Presentational/dumb.

import { X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  HEADER_HEIGHT_PX,
  type ExtractTabKey,
  type ExtractTabContract,
} from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractImageModalHeader');

interface ExtractImageModalHeaderProps {
  activeTab: ExtractTabKey;
  tabs: ExtractTabContract[];
  onTabChange: (tab: ExtractTabKey) => void;
  onClose: () => void;
  /** processing || committing — blocks tab switching + the close button. */
  disabled: boolean;
}

export function ExtractImageModalHeader({
  activeTab,
  tabs,
  onTabChange,
  onClose,
  disabled,
}: ExtractImageModalHeaderProps) {
  // ←/→ navigates only among ENABLED tabs (disabled registry slots are skipped).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const enabled = tabs.filter((t) => t.enabled);
    const curIdx = enabled.findIndex((t) => t.key === activeTab);
    if (curIdx === -1) return;
    const nextIdx =
      e.key === 'ArrowLeft'
        ? Math.max(0, curIdx - 1)
        : Math.min(enabled.length - 1, curIdx + 1);
    if (nextIdx === curIdx) return;
    const nextKey = enabled[nextIdx].key;
    log.debug('handleKeyDown', 'arrow navigate tab', { from: activeTab, to: nextKey });
    onTabChange(nextKey);
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
        id="extract-image-modal-title"
        className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--swap-modal-text-primary)]"
      >
        Extracting Image
      </h2>

      <div
        role="tablist"
        aria-label="Extract tools"
        className="flex items-center gap-0.5 rounded-lg bg-[var(--swap-modal-surface-hover)] p-1"
      >
        {tabs.map(({ key, label, icon: Icon, enabled }) => {
          const isActive = key === activeTab;
          const isDisabled = !enabled || disabled;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled}
              title={!enabled ? 'Coming soon' : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (isDisabled || key === activeTab) return;
                log.debug('onClick', 'tab change', { to: key });
                onTabChange(key);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'bg-white font-semibold text-[#0a0d18] shadow-sm'
                  : 'text-[var(--swap-modal-text-muted)] hover:text-[var(--swap-modal-text-primary)]',
                !enabled && 'cursor-not-allowed opacity-40 hover:text-[var(--swap-modal-text-muted)]',
                enabled && disabled && 'cursor-not-allowed',
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
          aria-label="Close"
          disabled={disabled}
          onClick={() => {
            log.debug('onClick', 'close modal');
            onClose();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
