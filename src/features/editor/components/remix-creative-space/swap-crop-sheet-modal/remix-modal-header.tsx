// remix-modal-header.tsx — Header band for SwapCropSheetModal (design §3.1).
// Title (remix name) + the ⚡2026-06-12 4-tab PIPELINE pill group
// (Sprites › Crops › Remove BG › Upscale — chevron separators express the
// stage 1→2→3 flow) + close. Tab ids are stable (`'variants'`/`'batches'`/
// `'rmbg'`/`'upscale'`) and ≠ display labels. Roving-tabindex tablist — ←/→
// moves the active tab.

import {
  ChevronRight,
  Eraser,
  Expand,
  LayoutGrid,
  SplitSquareHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixModalTab } from '@/types/remix';
import { HEADER_HEIGHT_PX } from './swap-modal-constants';

const log = createLogger('Editor', 'RemixModalHeader');

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

// Order is BOTH the pipeline order and the keyboard navigation order for ←/→.
const TABS: TabDef[] = [
  { id: 'variants', label: 'Sprites', Icon: SplitSquareHorizontal },
  { id: 'batches', label: 'Crops', Icon: LayoutGrid },
  { id: 'rmbg', label: 'Remove BG', Icon: Eraser },
  { id: 'upscale', label: 'Upscale', Icon: Expand },
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
    // Tab buttons sit in per-pill wrappers with decorative chevrons between
    // them — resolve siblings from the tablist by role, not by child index.
    const tabEls = e.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll('[role="tab"]');
    const sibling = tabEls?.[next];
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
        className="flex items-center gap-0.5 rounded-lg bg-[var(--swap-modal-surface-hover)] p-1"
      >
        {TABS.map(({ id, label, Icon }, index) => {
          const isActive = id === activeTab;
          return (
            // Fragment per pill: chevron separator BETWEEN tabs (pipeline flow).
            <span key={id} className="flex items-center gap-0.5">
              {index > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-[var(--swap-modal-text-muted)]"
                />
              )}
              <button
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
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors',
                  isActive
                    ? 'bg-white font-semibold text-[#0a0d18] shadow-sm'
                    : 'text-[var(--swap-modal-text-muted)] hover:text-[var(--swap-modal-text-primary)]',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            </span>
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
