// extract-results-sidebar.tsx — Left sidebar (design README §3.2): session-local result
// grid for the active tab + the single `[+]` run trigger. Click a thumb → preview on the
// canvas; hover → 🗑 delete from the grid (no Storage delete — results aren't uploaded yet).
// Presentational/dumb — all state + handlers live in the root orchestrator.

import { Plus, Loader2, Trash2, Check } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { LEFT_SIDEBAR_WIDTH_PX, type ExtractResult } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractResultsSidebar');

interface ExtractResultsSidebarProps {
  /** Active tab label (SEGMENTS / LAYERS) — already display-cased by the registry. */
  title: string;
  results: ExtractResult[];
  selectedResultId: string | null;
  onSelectResult: (id: string) => void;
  onDeleteResult: (id: string) => void;
  onRunExtract: () => void;
  /** AND of root gates (busy / no source / tab canRun). */
  runDisabled: boolean;
  isProcessing: boolean;
}

export function ExtractResultsSidebar({
  title,
  results,
  selectedResultId,
  onSelectResult,
  onDeleteResult,
  onRunExtract,
  runDisabled,
  isProcessing,
}: ExtractResultsSidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Extract results"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          {title}
        </span>
        <button
          type="button"
          aria-label="Run extract"
          title="Run extract"
          aria-busy={isProcessing}
          aria-disabled={runDisabled}
          disabled={runDisabled}
          onClick={() => {
            log.debug('onClick', 'run trigger', { title });
            onRunExtract();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--swap-modal-accent)] text-white transition-colors hover:bg-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
        >
          {isProcessing ? (
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
        {results.length > 0 ? (
          results.map((result, index) => {
            const isSelected = result.id === selectedResultId;
            return (
              <div
                key={result.id}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-md bg-[var(--swap-modal-card-bg)] transition-all',
                  isSelected
                    ? 'ring-2 ring-[var(--swap-modal-accent)]'
                    : 'ring-1 ring-[var(--swap-modal-border)] hover:ring-[var(--swap-modal-border-strong)]',
                )}
              >
                <button
                  type="button"
                  aria-label={`Preview ${result.title}`}
                  onClick={() => onSelectResult(result.id)}
                  className="absolute inset-0 h-full w-full"
                >
                  <img
                    src={result.media_url}
                    alt={result.title || `Result ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                </button>

                {isSelected && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-[var(--swap-modal-accent)] p-1">
                    <Check className="h-3 w-3 text-white" aria-hidden="true" />
                  </span>
                )}

                <button
                  type="button"
                  aria-label={`Delete ${result.title}`}
                  onClick={() => {
                    log.debug('onClick', 'delete result', { resultId: result.id });
                    onDeleteResult(result.id);
                  }}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)] group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <p className="col-span-2 px-2 py-8 text-center text-xs text-[var(--swap-modal-text-muted)]">
            Press [+] to extract
          </p>
        )}
      </div>
    </aside>
  );
}
