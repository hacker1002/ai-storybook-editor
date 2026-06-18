// generated-sidebar.tsx — Left sidebar (design §3.2): per-mode illustration history
// + the single mode-aware [+] action trigger. Presentational/dumb — state + the
// add/select handlers live in the root orchestrator.

import { Plus, Check, Loader2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Illustration } from '@/types/prop-types';
import { LEFT_SIDEBAR_WIDTH_PX } from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';
import type { GenerateModalMode } from './generate-image-modal-constants';

const log = createLogger('Editor', 'GeneratedSidebar');

interface GeneratedSidebarProps {
  mode: GenerateModalMode;
  /** Mode-filtered history (created vs uploaded), newest-first — built by the root. */
  items: Illustration[];
  selectedUrl: string | null;
  addDisabled: boolean;
  busy: boolean;
  onAdd: () => void;
  onSelect: (mediaUrl: string) => void;
}

export function GeneratedSidebar({
  mode,
  items,
  selectedUrl,
  addDisabled,
  busy,
  onAdd,
  onSelect,
}: GeneratedSidebarProps) {
  const title = mode === 'generate' ? 'GENERATED' : 'UPLOADED';
  const addLabel = mode === 'generate' ? 'Generate ảnh' : 'Upload ảnh';
  const emptyHint =
    mode === 'generate'
      ? 'No images generated yet'
      : 'Use [+] or drag & drop to upload';

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Lịch sử ảnh"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          {title}
        </span>
        <button
          type="button"
          aria-label={addLabel}
          title={addLabel}
          aria-busy={busy}
          aria-disabled={addDisabled}
          disabled={addDisabled}
          onClick={() => {
            log.debug('onClick', 'add trigger', { mode });
            onAdd();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--swap-modal-accent)] text-white transition-colors hover:bg-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        role="listbox"
        aria-label={title}
        className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3"
      >
        {items.length > 0 ? (
          items.map((ill, index) => {
            const isSelected = ill.media_url === selectedUrl;
            return (
              <button
                key={`${ill.media_url}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(ill.media_url)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-md bg-[var(--swap-modal-card-bg)] transition-all',
                  isSelected
                    ? 'ring-2 ring-[var(--swap-modal-accent)]'
                    : 'ring-1 ring-[var(--swap-modal-border)] hover:ring-[var(--swap-modal-border-strong)]',
                )}
              >
                <img
                  src={ill.media_url}
                  alt={`${title} ${index + 1}`}
                  className="h-full w-full object-contain"
                />
                {isSelected && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--swap-modal-accent)] p-1">
                    <Check className="h-3 w-3 text-white" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <p className="col-span-2 px-2 py-8 text-center text-xs text-[var(--swap-modal-text-muted)]">
            {emptyHint}
          </p>
        )}
      </div>
    </aside>
  );
}
