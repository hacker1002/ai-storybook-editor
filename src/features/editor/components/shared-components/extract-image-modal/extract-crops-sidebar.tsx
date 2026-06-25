// extract-crops-sidebar.tsx — Left sidebar for the Crops tab (design 05-crops-tab.md §4.1):
// a crop-box list overriding the result grid. Each row ↔ one CropBox (frame icon + display
// label incl. dirty `*`). Selected row gets an accent bar + 3 actions: ✎ Edit (inline rename),
// 💾 Save (upsert preset, brief green flash), 🗑 Delete (remove preset book-wide + box, behind
// a confirm dialog when linked). `[+]` adds a Custom crop box (no API). Presentational/dumb —
// all state + handlers live in the root orchestrator + crops hook.

import { useRef, useState } from 'react';
import { Plus, Pencil, Save, Trash2, Check, X, Frame } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX, LEFT_SIDEBAR_WIDTH_PX, type CropBox } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractCropsSidebar');

const FLASH_MS = 600; // 💾 Save confirmation flash duration (design §5)

interface ExtractCropsSidebarProps {
  title: string;
  boxes: CropBox[];
  selectedBoxId: string | null;
  editingBoxId: string | null;
  displayLabel: (boxId: string) => string;
  /** onUpsertCropPreset wired → 💾 Save enabled. */
  canSave: boolean;
  onAddBox: () => void;
  onSelectBox: (id: string) => void;
  onStartEdit: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCancelEdit: () => void;
  onSaveBox: (id: string) => void;
  onDeleteCropPreset: (id: string) => void;
  /** Root gate: busy or no source — [+] cannot add a box. */
  addDisabled: boolean;
}

export function ExtractCropsSidebar({
  title,
  boxes,
  selectedBoxId,
  editingBoxId,
  displayLabel,
  canSave,
  onAddBox,
  onSelectBox,
  onStartEdit,
  onRename,
  onCancelEdit,
  onSaveBox,
  onDeleteCropPreset,
  addDisabled,
}: ExtractCropsSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [flashBoxId, setFlashBoxId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = (id: string) => {
    log.debug('handleSave', 'save box', { boxId: id });
    onSaveBox(id);
    setFlashBoxId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashBoxId(null), FLASH_MS);
  };

  const commitRename = (id: string) => {
    onRename(id, inputRef.current?.value ?? '');
  };

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Crops"
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
            const isEditing = box.id === editingBoxId;
            const isFlashing = box.id === flashBoxId;

            if (isEditing) {
              return (
                <div
                  key={box.id}
                  className="relative flex items-center gap-2 rounded-md bg-[var(--swap-modal-surface-hover)] py-1.5 pl-3 pr-2"
                >
                  <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-[var(--swap-modal-accent)]" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    key={box.id}
                    defaultValue={box.title}
                    autoFocus
                    aria-label="Crop title"
                    onKeyDown={(e) => {
                      // stopPropagation so the modal ILS doesn't also act: Escape bypasses
                      // the provider's editable-element guard and would otherwise close the
                      // whole modal instead of just cancelling the inline rename.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        commitRename(box.id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        onCancelEdit();
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-bg)] px-2 py-1 text-sm text-[var(--swap-modal-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--swap-modal-accent)]"
                  />
                  <button
                    type="button"
                    aria-label="Confirm rename"
                    onClick={() => commitRename(box.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-accent)] hover:text-white"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={onCancelEdit}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            }

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
                    className="absolute inset-y-1 left-0 w-1 rounded-full bg-[var(--swap-modal-accent)]"
                    aria-hidden="true"
                  />
                )}
                <Frame
                  className={cn('h-4 w-4 shrink-0', isSelected ? 'text-[var(--swap-modal-accent)]' : '')}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{displayLabel(box.id)}</span>

                {isSelected && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Rename ${box.title}`}
                      title="Edit name"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit(box.id);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Save ${box.title} as preset`}
                      title={canSave ? 'Save as preset' : 'Saving presets unavailable'}
                      disabled={!canSave}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave(box.id);
                      }}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)] disabled:cursor-not-allowed disabled:opacity-40',
                        isFlashing
                          ? 'bg-green-600 text-white'
                          : 'text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-accent)] hover:text-white',
                      )}
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${box.title}`}
                      title="Delete preset"
                      onClick={(e) => {
                        e.stopPropagation();
                        log.debug('onClick', 'delete crop preset', { boxId: box.id });
                        onDeleteCropPreset(box.id);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--swap-modal-text-muted)] transition-colors hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="px-2 py-8 text-center text-xs text-[var(--swap-modal-text-muted)]">
            Press [+] to add a crop area
          </p>
        )}
      </div>
    </aside>
  );
}
