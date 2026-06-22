// edit-image-modal-versions-sidebar.tsx — Left sidebar (design §3.2): version grid
// (illustrations[], newest-first) + the single `[+]` run/commit trigger of the active tool.
// Click a thumb → select (canvas swaps); hover → 🔍 zoom (full-image preview). Selected →
// ring accent + ✓. Presentational/dumb — all state + handlers live in the shell.

import { Plus, Loader2, Check, Search } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Illustration } from '@/types/prop-types';
import { HEADER_HEIGHT_PX, LEFT_SIDEBAR_WIDTH_PX } from './edit-image-modal-constants';

const log = createLogger('Editor', 'EditImageVersionsSidebar');

interface VersionsSidebarProps {
  versions: Illustration[];
  onSelectVersion: (index: number) => void;
  onCommit: () => void;
  commitDisabled: boolean;
  isProcessing: boolean;
  /** [+] aria-label + tooltip — tool-specific ("Run remove background" / "Save erased version"). */
  commitHint: string;
  onZoom: (src: string) => void;
}

export function EditImageModalVersionsSidebar({
  versions,
  onSelectVersion,
  onCommit,
  commitDisabled,
  isProcessing,
  commitHint,
  onZoom,
}: VersionsSidebarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Versions"
    >
      <div
        className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          Versions
        </span>
        <button
          type="button"
          aria-label={commitHint}
          title={commitHint}
          aria-busy={isProcessing}
          aria-disabled={commitDisabled}
          disabled={commitDisabled}
          onClick={() => {
            log.debug('onClick', 'commit trigger', { commitHint });
            onCommit();
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
        aria-label="Versions"
        className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3"
      >
        {versions.length > 0 ? (
          versions.map((version, index) => {
            const isSelected = version.is_selected;
            return (
              <div
                key={`${version.media_url}-${index}`}
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
                  aria-label={`Select version ${index + 1}`}
                  onClick={() => onSelectVersion(index)}
                  className="absolute inset-0 h-full w-full"
                >
                  <img
                    src={version.media_url}
                    alt={`Version ${index + 1}`}
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
                  aria-label={`Zoom version ${index + 1}`}
                  onClick={() => {
                    log.debug('onClick', 'zoom version', { index });
                    onZoom(version.media_url);
                  }}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-[var(--swap-modal-accent)] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)] group-hover:opacity-100"
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <p className="col-span-2 px-2 py-8 text-center text-xs text-[var(--swap-modal-text-muted)]">
            No versions
          </p>
        )}
      </div>
    </aside>
  );
}
