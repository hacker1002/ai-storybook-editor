// extract-objects-sidebar.tsx — Left sidebar for the Objects tab (design 03-objects-tab.md
// §4.1): a box/object list that overrides the result grid. Each row ↔ one ObjectBox (color
// swatch + label); selected row gets an accent bar + 🗑. `[+]` adds a manual crop box (no API).
// Presentational/dumb — state + handlers live in the root orchestrator + objects hook.

import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX, LEFT_SIDEBAR_WIDTH_PX, type ObjectBox } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractObjectsSidebar');

interface ExtractObjectsSidebarProps {
  title: string;
  boxes: ObjectBox[];
  selectedBoxId: string | null;
  onSelectBox: (id: string) => void;
  onDeleteBox: (id: string) => void;
  onAddBox: () => void;
  /** Root gate: busy or no source — [+] cannot add a box. */
  addDisabled: boolean;
}

export function ExtractObjectsSidebar({
  title,
  boxes,
  selectedBoxId,
  onSelectBox,
  onDeleteBox,
  onAddBox,
  addDisabled,
}: ExtractObjectsSidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Objects"
    >
      <div
        className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          {title}
        </span>
        <button
          type="button"
          aria-label="Add crop area"
          title="Add crop area"
          aria-disabled={addDisabled}
          disabled={addDisabled}
          onClick={() => {
            log.debug('onClick', 'add box');
            onAddBox();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--swap-modal-accent)] text-white transition-colors hover:bg-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div role="listbox" aria-label={title} className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {boxes.length > 0 ? (
          boxes.map((box) => {
            const isSelected = box.id === selectedBoxId;
            return (
              <div
                key={box.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelectBox(box.id)}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-2 rounded-md py-2 pl-3 pr-2 text-sm transition-colors',
                  isSelected
                    ? 'bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-primary)]'
                    : 'text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)]/60',
                )}
              >
                {isSelected && (
                  <span
                    className="absolute inset-y-1 left-0 w-1 rounded-full"
                    style={{ background: box.color }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2"
                  style={{ borderColor: box.color, background: isSelected ? box.color : 'transparent' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate" style={isSelected ? { color: box.color } : undefined}>
                  {box.label}
                </span>
                {isSelected && (
                  <button
                    type="button"
                    aria-label={`Delete ${box.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      log.debug('onClick', 'delete box', { boxId: box.id });
                      onDeleteBox(box.id);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--swap-modal-text-muted)] transition-colors hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="px-2 py-8 text-center text-xs text-[var(--swap-modal-text-muted)]">
            Press [+] to add a crop area, or Detect to find objects
          </p>
        )}
      </div>
    </aside>
  );
}
