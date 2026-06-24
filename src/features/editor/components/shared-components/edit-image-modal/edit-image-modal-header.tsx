// edit-image-modal-header.tsx — Header band for the Editing-Image workspace (design §3.1).
// Title (left) + EDIT_TOOLS tablist (center, ←/→ roving tabindex, disabled tools skipped +
// "Coming soon" tooltip) + close (right). Clone of the Extract header with the extract-tool
// registry swapped for the edit-tool registry. Presentational/dumb.

import { X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  HEADER_HEIGHT_PX,
  type EditToolKey,
  type EditToolContract,
} from './edit-image-modal-constants';

const log = createLogger('Editor', 'EditImageModalHeader');

interface EditImageModalHeaderProps {
  title: string;
  activeTool: EditToolKey;
  tools: EditToolContract[];
  /** Per-space availability (matrix gate #1). `undefined` → all available (legacy). Tools NOT
   *  in this list render disabled + "Coming soon" — never hidden (unified with unbuilt tools). */
  enabledKeys?: EditToolKey[];
  onToolChange: (tool: EditToolKey) => void;
  onClose: () => void;
  /** isProcessing — blocks tool switching + the close button. */
  disabled: boolean;
}

export function EditImageModalHeader({
  title,
  activeTool,
  tools,
  enabledKeys,
  onToolChange,
  onClose,
  disabled,
}: EditImageModalHeaderProps) {
  // A tool is SELECTABLE only when available-in-space AND built; otherwise it shows as a
  // disabled "Coming soon" tab (never hidden — unified 2-state model across all image modals).
  const isAvailable = (key: EditToolKey) => enabledKeys === undefined || enabledKeys.includes(key);
  const isSelectable = (t: EditToolContract) => isAvailable(t.key) && t.enabled;

  // ←/→ navigates only among SELECTABLE tools (coming-soon slots are skipped).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const selectable = tools.filter(isSelectable);
    const curIdx = selectable.findIndex((t) => t.key === activeTool);
    if (curIdx === -1) return;
    const nextIdx =
      e.key === 'ArrowLeft' ? Math.max(0, curIdx - 1) : Math.min(selectable.length - 1, curIdx + 1);
    if (nextIdx === curIdx) return;
    const nextKey = selectable[nextIdx].key;
    log.debug('handleKeyDown', 'arrow navigate tool', { from: activeTool, to: nextKey });
    onToolChange(nextKey);
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
        id="edit-image-modal-title"
        className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--swap-modal-text-primary)]"
      >
        {title}
      </h2>

      <div
        role="tablist"
        aria-label="Edit tools"
        className="flex items-center gap-0.5 rounded-lg bg-[var(--swap-modal-surface-hover)] p-1"
      >
        {tools.map(({ key, label, icon: Icon, enabled }) => {
          const isActive = key === activeTool;
          const comingSoon = !isAvailable(key) || !enabled; // gated-off (matrix) OR unbuilt
          const isDisabled = comingSoon || disabled;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled}
              title={comingSoon ? 'Coming soon' : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (isDisabled || key === activeTool) return;
                log.debug('onClick', 'tool change', { to: key });
                onToolChange(key);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'bg-white font-semibold text-[#0a0d18] shadow-sm'
                  : 'text-[var(--swap-modal-text-muted)] hover:text-[var(--swap-modal-text-primary)]',
                comingSoon && 'cursor-not-allowed opacity-40 hover:text-[var(--swap-modal-text-muted)]',
                !comingSoon && disabled && 'cursor-not-allowed',
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
