// remix-modal-header.tsx — Header band for SwapCropSheetModal (design §3.1).
// Title "Remix" + a 3-tab group (Characters / Props / Mixes) + close button.
// The tab group is a roving-tabindex `tablist` — ←/→ moves the active tab.

import { Users, Package, Shuffle, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  HEADER_HEIGHT_PX,
  type RemixEntityType,
} from './swap-modal-constants';

const log = createLogger('Editor', 'RemixModalHeader');

interface RemixModalHeaderProps {
  activeTab: RemixEntityType;
  onTabChange: (tab: RemixEntityType) => void;
  onClose: () => void;
}

interface TabDef {
  id: RemixEntityType;
  label: string;
  Icon: typeof Users;
}

// Order is the keyboard navigation order for ←/→.
const TABS: TabDef[] = [
  { id: 'character', label: 'Characters', Icon: Users },
  { id: 'prop', label: 'Props', Icon: Package },
  { id: 'mix', label: 'Mixes', Icon: Shuffle },
];

export function RemixModalHeader({
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
      className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4"
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <h2 id="swap-crop-sheet-modal-title" className="text-base font-semibold">
        Remix
      </h2>

      <div
        role="tablist"
        aria-label="Loại entity"
        className="flex items-center gap-1 rounded-lg bg-muted p-1"
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
                  ? 'bg-background font-semibold text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Đóng"
        onClick={() => {
          log.debug('onClick', 'close modal');
          onClose();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}
