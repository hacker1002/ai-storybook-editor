// generate-image-modal-header.tsx — Header band for the Creating-Image workspace
// (design §3.1). Title (left) + Generate/Upload mode tablist (center) + close (right).
// Mirrors the swap modal's RemixModalHeader (tab pill group, ←/→ roving tabindex).

import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX } from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';
import type { GenerateModalMode } from './generate-image-modal-constants';

const log = createLogger('Editor', 'GenerateImageModalHeader');

interface GenerateImageModalHeaderProps {
  mode: GenerateModalMode;
  onModeChange: (mode: GenerateModalMode) => void;
  onClose: () => void;
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
}: GenerateImageModalHeaderProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === mode);
    let next = currentIndex;
    if (e.key === 'ArrowLeft') next = Math.max(0, currentIndex - 1);
    else if (e.key === 'ArrowRight') next = Math.min(TABS.length - 1, currentIndex + 1);
    else return;
    e.preventDefault();
    if (next === currentIndex) return;
    log.debug('handleKeyDown', 'arrow navigate mode', { from: TABS[currentIndex].id, to: TABS[next].id });
    onModeChange(TABS[next].id);
    const tabEls = e.currentTarget.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]');
    const sibling = tabEls?.[next];
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
          const isActive = id === mode;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                if (id === mode) return;
                log.debug('onClick', 'mode change', { to: id });
                onModeChange(id);
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
