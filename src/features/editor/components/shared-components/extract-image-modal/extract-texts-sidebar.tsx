// extract-texts-sidebar.tsx — Left sidebar for the Texts tab (design 06-texts-tab.md §4.1):
// a read-only list of detected text regions. Each row ↔ one TextBox (numbered badge + content);
// selected row gets an accent bar + 🗑. NO `[+]` — text is Detect-only (no manual box). Rows are
// read-only (content is not editable here — the user edits the spawned raw_textbox in the editor).
// Presentational/dumb — state + handlers live in the root orchestrator + texts hook.

import { Trash2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX, LEFT_SIDEBAR_WIDTH_PX, type TextBox } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractTextsSidebar');

interface ExtractTextsSidebarProps {
  title: string;
  texts: TextBox[];
  selectedTextId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ExtractTextsSidebar({
  title,
  texts,
  selectedTextId,
  onSelect,
  onDelete,
}: ExtractTextsSidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Texts"
    >
      {/* Header — no [+]: text is Detect-only. */}
      <div
        className="flex shrink-0 items-center border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          {title}
        </span>
      </div>

      <div role="listbox" aria-label={title} className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {texts.length > 0 ? (
          texts.map((box) => {
            const isSelected = box.id === selectedTextId;
            const preview = box.content.trim() || '(empty)';
            return (
              <div
                key={box.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(box.id)}
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
                {/* Numbered ordinal badge (matches the canvas box badge). */}
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: box.color }}
                  aria-hidden="true"
                >
                  {box.index}
                </span>
                <span
                  className="min-w-0 flex-1 truncate"
                  title={box.content}
                  style={isSelected ? { color: box.color } : undefined}
                >
                  {preview}
                </span>
                {isSelected && (
                  <button
                    type="button"
                    aria-label={`Delete text ${box.index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      log.debug('onClick', 'delete text', { textId: box.id });
                      onDelete(box.id);
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
            Press Detect to find text in this image
          </p>
        )}
      </div>
    </aside>
  );
}
