// remix-modal-header.tsx — Header band for SwapCropSheetModal (design §3.1, rev2).
// Title (remix name) + a 3-tab pill group (Variants / Batches / Lotties) + close.
// The tab group is a roving-tabindex `tablist` — ←/→ moves the active tab.

import { SplitSquareHorizontal, LayoutGrid, Sparkles, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX } from './swap-modal-constants';

const log = createLogger('Editor', 'RemixModalHeader');

/** The three top-level tabs of the rev2 swap modal. */
export type RemixModalTab = 'variants' | 'batches' | 'lotties';

interface RemixModalHeaderProps {
  title: string;
  activeTab: RemixModalTab;
  onTabChange: (tab: RemixModalTab) => void;
  onClose: () => void;
}

interface TabDef {
  id: RemixModalTab;
  label: string;
  Icon: typeof SplitSquareHorizontal;
}

// Order is the keyboard navigation order for ←/→.
const TABS: TabDef[] = [
  { id: 'variants', label: 'Variants', Icon: SplitSquareHorizontal },
  { id: 'batches', label: 'Batches', Icon: LayoutGrid },
  { id: 'lotties', label: 'Lotties', Icon: Sparkles },
];

export function RemixModalHeader({
  title,
  activeTab,
  onTabChange,
  onClose,
}: RemixModalHeaderProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === activeTab);
    let next = currentIndex;
    if (e.key === 'ArrowLeft') next = Math.max(0, currentIndex - 1);
    else if (e.key === 'ArrowRight')
      next = Math.min(TABS.length - 1, currentIndex + 1);
    else return;
    e.preventDefault();
    if (next === currentIndex) return;
    log.debug('handleKeyDown', 'arrow navigate tab', {
      from: TABS[currentIndex].id,
      to: TABS[next].id,
    });
    onTabChange(TABS[next].id);
    const sibling = e.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  };

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <h2
        id="swap-crop-sheet-modal-title"
        className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--swap-modal-text-primary)]"
        title={title}
      >
        {title}
      </h2>

      <div
        role="tablist"
        aria-label="Chế độ remix"
        className="flex items-center gap-1 rounded-lg bg-[var(--swap-modal-surface-hover)] p-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (id === activeTab) return;
                log.debug('onClick', 'tab change', { to: id });
                onTabChange(id);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'bg-white font-semibold text-[#0a0d18] shadow-sm'
                  : 'text-[var(--swap-modal-text-muted)] hover:text-[var(--swap-modal-text-primary)]',
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
