// batches-sidebar.tsx — Batch→Sheet tree for the rev2 BatchesTab (Phase 08).
//
// Two-level ARIA tree (role=tree → batch treeitem → sheet treeitem). Header
// `BATCHES` + [+] addBatch. Each batch row: caret (collapse, owned by the tab
// via the generic use-collapse-state hook) + name + sheet stepper [−] K [+] +
// [✕] removeBatch. Sheet rows: dot + title, active highlight, click → select.
//
// PRESENTATIONAL only: the tab passes already-guarded callbacks. The confirm
// dialog (destructive relayout when swap_results present) is mounted + driven by
// the tab — this component just invokes the callbacks it receives. Disabled
// states (SHEET_MIN/MAX, BATCH_MIN, anyMixSwapRunning) are computed here from
// props for correct a11y, but the tab also guards before mutating.

import { ChevronDown, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixBatch } from '@/types/remix';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BATCH_MIN,
  LEFT_SIDEBAR_WIDTH_PX,
  SHEET_MAX,
  SHEET_MIN,
} from '../swap-modal-constants';

const log = createLogger('Editor', 'BatchesSidebar');

interface BatchesSidebarProps {
  batches: RemixBatch[];
  activeBatchRef: { batchId: string; sheetIndex: number } | null;
  isCollapsed: (batchId: string) => boolean;
  onToggleCollapse: (batchId: string) => void;
  /** Steppers/add/remove globally locked while any mix swap is running. */
  anyMixSwapRunning: boolean;
  /** ⚡rev6 — [+] button disabled when false (no selection OR busy). The tab
   *  derives the full predicate including `anyMixSwapRunning`. */
  canAddBatch: boolean;
  /** ⚡rev6 — explanatory tooltip when `[+]` is disabled. Empty string when
   *  enabled — avoids rendering an empty Tooltip wrapper. */
  addBatchTooltip: string;
  /** ⚡rev6 — number of swap-crops currently ticked; drives the `(N sel)`
   *  badge in the header + the `[+]` button's aria-label. */
  selectionSize: number;
  onSelectBatchSheet: (batchId: string, sheetIndex: number) => void;
  onAddBatch: () => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces BATCH_MIN. */
  onRemoveBatch: (batchId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SHEET_MAX. */
  onAddSheet: (batchId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SHEET_MIN. */
  onRemoveSheet: (batchId: string, sheetIndex: number) => void;
}

export function BatchesSidebar({
  batches,
  activeBatchRef,
  isCollapsed,
  onToggleCollapse,
  anyMixSwapRunning,
  canAddBatch,
  addBatchTooltip,
  selectionSize,
  onSelectBatchSheet,
  onAddBatch,
  onRemoveBatch,
  onAddSheet,
  onRemoveSheet,
}: BatchesSidebarProps) {
  const canRemoveBatch = batches.length > BATCH_MIN;

  // ⚡rev6 — Wrap the `[+]` button in a Tooltip only when there's gating text
  // to surface (avoid an empty-content popover on the happy path).
  const addBatchButton = (
    <button
      type="button"
      aria-label={`Add batch (${selectionSize} crops selected)`}
      disabled={!canAddBatch}
      onClick={() => {
        log.debug('onAddBatch', 'add batch', {
          batchCount: batches.length,
          selectionSize,
        });
        onAddBatch();
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: LEFT_SIDEBAR_WIDTH_PX }}
      aria-label="Batches"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
            Batches
          </p>
          {selectionSize > 0 && (
            <span
              aria-hidden="true"
              className="text-xs font-medium tabular-nums text-[var(--swap-modal-text-muted)]"
            >
              ({selectionSize} sel)
            </span>
          )}
        </div>
        {addBatchTooltip ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              {/* `asChild` requires a focusable child — the disabled button is
                  still focusable on hover, but Radix recommends wrapping a
                  disabled trigger in a span so the tooltip stays operable. */}
              <TooltipTrigger asChild>
                <span tabIndex={-1} className="inline-flex">
                  {addBatchButton}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {addBatchTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          addBatchButton
        )}
      </div>

      {batches.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Chưa có batch nào.
          </p>
        </div>
      ) : (
        <div
          role="tree"
          aria-label="Batches tree"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {batches.map((batch) => (
            <BatchNode
              key={batch.id}
              batch={batch}
              activeBatchRef={activeBatchRef}
              collapsed={isCollapsed(batch.id)}
              anyMixSwapRunning={anyMixSwapRunning}
              canRemoveBatch={canRemoveBatch}
              onToggleCollapse={onToggleCollapse}
              onSelectBatchSheet={onSelectBatchSheet}
              onRemoveBatch={onRemoveBatch}
              onAddSheet={onAddSheet}
              onRemoveSheet={onRemoveSheet}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface BatchNodeProps {
  batch: RemixBatch;
  activeBatchRef: { batchId: string; sheetIndex: number } | null;
  collapsed: boolean;
  anyMixSwapRunning: boolean;
  canRemoveBatch: boolean;
  onToggleCollapse: (batchId: string) => void;
  onSelectBatchSheet: (batchId: string, sheetIndex: number) => void;
  onRemoveBatch: (batchId: string) => void;
  onAddSheet: (batchId: string) => void;
  onRemoveSheet: (batchId: string, sheetIndex: number) => void;
}

function BatchNode({
  batch,
  activeBatchRef,
  collapsed,
  anyMixSwapRunning,
  canRemoveBatch,
  onToggleCollapse,
  onSelectBatchSheet,
  onRemoveBatch,
  onAddSheet,
  onRemoveSheet,
}: BatchNodeProps) {
  const sheetCount = batch.crop_sheets.length;
  const isActiveBatch = activeBatchRef?.batchId === batch.id;
  const removeSheetDisabled = anyMixSwapRunning || sheetCount <= SHEET_MIN;
  const addSheetDisabled = anyMixSwapRunning || sheetCount >= SHEET_MAX;
  // ⚡rev6 — Tiny muted "· N crops" badge after the name. Derived inline
  // (O(sheets) reduce, cheap — no memo). Skip when 0 to avoid noise.
  const cropCount = batch.crop_sheets.reduce(
    (acc, s) => acc + s.crops.length,
    0,
  );

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={!collapsed}
      aria-selected={isActiveBatch}
      className="flex flex-col"
    >
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-2">
        {/* Caret + name → toggle collapse only (never selects a sheet). */}
        <button
          type="button"
          aria-label={`${collapsed ? 'Mở' : 'Thu gọn'} ${batch.name}`}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(batch.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--swap-modal-surface-hover)] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
        >
          <span
            aria-hidden="true"
            className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
            {batch.name}
          </span>
          {cropCount > 0 && (
            <span
              aria-hidden="true"
              className="ml-1 shrink-0 text-xs tabular-nums text-[var(--swap-modal-text-muted)]"
            >
              · {cropCount} crops
            </span>
          )}
        </button>

        {/* Sheet stepper [−] K [+] */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`Bớt sheet của ${batch.name}`}
            disabled={removeSheetDisabled}
            onClick={() => {
              log.debug('onRemoveSheet', 'remove last sheet', {
                batchId: batch.id,
                sheetCount,
              });
              onRemoveSheet(batch.id, sheetCount - 1);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            aria-hidden="true"
            className="min-w-[1.25rem] text-center text-xs tabular-nums text-[var(--swap-modal-text-secondary)]"
          >
            {sheetCount}
          </span>
          <button
            type="button"
            aria-label={`Thêm sheet của ${batch.name}`}
            disabled={addSheetDisabled}
            onClick={() => {
              log.debug('onAddSheet', 'append sheet', {
                batchId: batch.id,
                sheetCount,
              });
              onAddSheet(batch.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--swap-modal-text-secondary)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* [✕] remove batch — only when above BATCH_MIN */}
        {canRemoveBatch && (
          <button
            type="button"
            aria-label={`Xoá ${batch.name}`}
            disabled={anyMixSwapRunning}
            onClick={() => {
              log.debug('onRemoveBatch', 'remove batch', { batchId: batch.id });
              onRemoveBatch(batch.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!collapsed && sheetCount > 0 && (
        <div role="group" className="flex flex-col">
          {batch.crop_sheets.map((_, sheetIndex) => {
            const isActive =
              isActiveBatch && activeBatchRef?.sheetIndex === sheetIndex;
            return (
              <button
                key={sheetIndex}
                type="button"
                role="treeitem"
                aria-level={2}
                aria-selected={isActive}
                onClick={() => {
                  log.debug('onSelectBatchSheet', 'select sheet', {
                    batchId: batch.id,
                    sheetIndex,
                  });
                  onSelectBatchSheet(batch.id, sheetIndex);
                }}
                className={cn(
                  'flex items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]',
                  isActive
                    ? 'bg-[var(--swap-modal-selection)] text-[var(--swap-modal-text-primary)]'
                    : 'text-[var(--swap-modal-text-secondary)] hover:bg-[var(--swap-modal-surface-hover)]',
                )}
                style={{ paddingLeft: 38 }}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--swap-modal-text-muted)]"
                />
                <span className="truncate font-medium">
                  Sheet {sheetIndex + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
