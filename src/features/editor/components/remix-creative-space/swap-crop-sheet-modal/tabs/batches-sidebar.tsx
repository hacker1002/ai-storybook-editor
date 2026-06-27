// batches-sidebar.tsx — Batch→Sheet tree shared by the 3 stage tabs
// (⚡2026-06-12 stage-generic — Crops / Remove BG / Upscale; title `BATCHES`
// is uniform across tabs per validation S1).
//
// Two-level ARIA tree (role=tree → batch treeitem → sheet treeitem). Header
// `BATCHES` + [+] addBatch. Each batch row (⚡2026-06-26):
//   row 1: caret (collapse) + name + right cluster [ stepper [−] K [+] |
//          primary action (Swap/Remove BG/Upscale) | (check — DEFERRED) ]
//   row 2: muted "N crops" count (moved below the title from the old inline
//          "· N crops" badge).
// Clicking the per-row action auto-selects that batch then calls the stage API
// (tab-supplied `batchAction.onRun`). Sheet rows: dot + title + "N crops" pill,
// active highlight, click → select.
//
// PRESENTATIONAL only: the tab passes already-guarded callbacks. The confirm
// dialog (destructive relayout when swap_results present) is mounted + driven by
// the tab — this component just invokes the callbacks it receives. Disabled
// states (SHEET_MIN/MAX, BATCH_MIN, anyJobRunning) are computed here from
// props for correct a11y, but the tab also guards before mutating.

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { RemixStageBatch } from '@/types/remix';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BATCH_MIN,
  LEFT_SIDEBAR_WIDTH_PX,
  SHEET_MIN,
  Z_INDEX,
} from '../swap-modal-constants';
import { DefectCheckButton } from '../defect-check-button';
import type { DetectActionState } from './detect-gating';
import type { BatchActionState } from './use-stage-batch-tab';

// Tooltips portal at z-50 (shared shadcn) which the z-4000 swapModal occludes —
// lift in-modal tooltips above it. ⚡2026-06-26 (see Z_INDEX.tooltip).
const TOOLTIP_CONTENT_STYLE = { zIndex: Z_INDEX.tooltip };

/** ⚡2026-06-26 — per-batch primary action (Swap / Remove BG / Upscale) moved
 *  from the stage header into each sidebar batch row. The tab supplies the
 *  stage icon + copy + the hook-backed evaluator/runner; the sidebar stays
 *  presentational (renders state, fires `onRun`). */
export interface BatchActionDescriptor {
  /** Stage glyph: Repeat (mixes) | Eraser (rmbgs) | Expand (upscales). */
  icon: LucideIcon;
  /** Base label, e.g. "Swap" — used for the icon-only button's tooltip/a11y. */
  label: string;
  /** Shown instead of `label` when the batch's last job errored. */
  retryLabel: string;
  /** Per-batch gate/busy/error state — drives disabled + spinner + tooltip. */
  getState: (batch: RemixStageBatch) => BatchActionState;
  /** Auto-select the batch then enqueue its stage job. */
  onRun: (batchId: string) => void;
}

/** ⚡2026-06-27 — per-batch Check (swap-defect detect) action, the `[✓]` slot
 *  sibling RIGHT of the primary Swap action (05-11 §4). Passed ONLY by the mixes
 *  tab (`STAGE_TAB_CONFIG.mixes.hasDetect`); rmbgs/upscales omit it → the slot is
 *  hidden (no identity swap → no defect). The shared `DefectCheckButton` renders
 *  it; the tab supplies the hook-backed evaluator/runner + result badge. */
export interface BatchDetectDescriptor {
  getState: (batch: RemixStageBatch) => DetectActionState;
  onRun: (batchId: string) => void;
}

const log = createLogger('Editor', 'BatchesSidebar');

// Delete-batch affordance hidden by product decision; flip to re-enable.
const SHOW_REMOVE_BATCH: boolean = false;

interface BatchesSidebarProps {
  batches: RemixStageBatch[];
  activeBatchRef: { batchId: string; sheetIndex: number } | null;
  isCollapsed: (batchId: string) => boolean;
  onToggleCollapse: (batchId: string) => void;
  /** Steppers/add/remove globally locked while a job of THIS stage runs. */
  anyJobRunning: boolean;
  /** ⚡2026-06-12 — rmbgs/upscales allow removing down to 0 batches; mixes
   *  keeps the first BATCH_MIN batches permanent. */
  allowZeroBatch?: boolean;
  /** ⚡rev6 — [+] button disabled when false (no selection OR busy). The tab
   *  derives the full predicate including `anyJobRunning`. */
  canAddBatch: boolean;
  /** ⚡rev6 — explanatory tooltip when `[+]` is disabled. Empty string when
   *  enabled — avoids rendering an empty Tooltip wrapper. */
  addBatchTooltip: string;
  /** ⚡rev6 — number of swap-crops currently ticked; drives the `(N sel)`
   *  badge in the header + the `[+]` button's aria-label. */
  selectionSize: number;
  /** ⚡2026-06-26 — per-batch primary action rendered in each row (tab-supplied
   *  stage icon + hook-backed gating/runner). */
  batchAction: BatchActionDescriptor;
  /** ⚡2026-06-27 — per-batch Check action (`[✓]` slot). Present ONLY on the
   *  mixes tab (`hasDetect`); omitted on rmbgs/upscales → slot hidden. */
  batchDetectAction?: BatchDetectDescriptor;
  onSelectBatchSheet: (batchId: string, sheetIndex: number) => void;
  onAddBatch: () => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces BATCH_MIN. */
  onRemoveBatch: (batchId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only caps at crop count. */
  onAddSheet: (batchId: string) => void;
  /** Tab-guarded (confirm-if-swap_results). Sidebar only enforces SHEET_MIN. */
  onRemoveSheet: (batchId: string, sheetIndex: number) => void;
}

export function BatchesSidebar({
  batches,
  activeBatchRef,
  isCollapsed,
  onToggleCollapse,
  anyJobRunning,
  allowZeroBatch = false,
  canAddBatch,
  addBatchTooltip,
  selectionSize,
  batchAction,
  batchDetectAction,
  onSelectBatchSheet,
  onAddBatch,
  onRemoveBatch,
  onAddSheet,
  onRemoveSheet,
}: BatchesSidebarProps) {
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
              <TooltipContent
                side="bottom"
                className="max-w-xs text-xs"
                style={TOOLTIP_CONTENT_STYLE}
              >
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
          {batches.map((batch, index) => (
            <BatchNode
              key={batch.id}
              batch={batch}
              activeBatchRef={activeBatchRef}
              collapsed={isCollapsed(batch.id)}
              anyJobRunning={anyJobRunning}
              // mixes: first BATCH_MIN batches are permanent (the seed batch);
              // rmbgs/upscales (allowZeroBatch): every batch is removable.
              canRemoveBatch={allowZeroBatch || index >= BATCH_MIN}
              batchAction={batchAction}
              batchDetectAction={batchDetectAction}
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
  batch: RemixStageBatch;
  activeBatchRef: { batchId: string; sheetIndex: number } | null;
  collapsed: boolean;
  anyJobRunning: boolean;
  canRemoveBatch: boolean;
  batchAction: BatchActionDescriptor;
  batchDetectAction?: BatchDetectDescriptor;
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
  anyJobRunning,
  canRemoveBatch,
  batchAction,
  batchDetectAction,
  onToggleCollapse,
  onSelectBatchSheet,
  onRemoveBatch,
  onAddSheet,
  onRemoveSheet,
}: BatchNodeProps) {
  const sheetCount = batch.crop_sheets.length;
  const isActiveBatch = activeBatchRef?.batchId === batch.id;
  // ⚡rev6 — Tiny muted "· N crops" badge after the name. Derived inline
  // (O(sheets) reduce, cheap — no memo). Skip when 0 to avoid noise. Also the
  // per-batch sheet ceiling: a sheet holds ≥1 crop, so K can never exceed the
  // crop count (replaces the old flat SHEET_MAX=10).
  const cropCount = batch.crop_sheets.reduce(
    (acc, s) => acc + s.original_crops.length,
    0,
  );
  const removeSheetDisabled = anyJobRunning || sheetCount <= SHEET_MIN;
  const addSheetDisabled = anyJobRunning || sheetCount >= cropCount;

  // ⚡2026-06-26 — per-row primary action (stage-supplied icon + hook gating).
  const action = batchAction.getState(batch);
  const ActionIcon = batchAction.icon;
  const actionLabel = action.isError ? batchAction.retryLabel : batchAction.label;

  return (
    <div
      role="treeitem"
      aria-level={1}
      aria-expanded={!collapsed}
      aria-selected={isActiveBatch}
      className="flex flex-col"
    >
      <div className="flex items-start gap-1.5 px-2 pb-1.5 pt-2">
        {/* Caret + name (+ crop count below) → toggle collapse only. */}
        <button
          type="button"
          aria-label={`${collapsed ? 'Mở' : 'Thu gọn'} ${batch.name}`}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(batch.id)}
          className="flex min-w-0 flex-1 items-start gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--swap-modal-surface-hover)] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--swap-modal-accent)]"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-4 shrink-0 items-center justify-center text-[var(--swap-modal-text-muted)]"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
          {/* ⚡2026-06-26 — name on row 1, "N crops" relocated to row 2. */}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[var(--swap-modal-text-primary)]">
              {batch.name}
            </span>
            {cropCount > 0 && (
              <span className="text-xs tabular-nums text-[var(--swap-modal-text-muted)]">
                {cropCount} crops
              </span>
            )}
          </span>
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

        {/* ⚡2026-06-26 — per-row primary action (Swap/Remove BG/Upscale).
            Click auto-selects the batch then enqueues the stage job. Tooltip
            carries the gate reason when disabled, else the action label (the
            button is icon-only). The [✓] check button sits to its right
            (⚡2026-06-27 — mixes only, via `batchDetectAction`). */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={-1} className="inline-flex shrink-0">
                <button
                  type="button"
                  aria-label={`${actionLabel} ${batch.name}`}
                  disabled={action.disabled || action.busy}
                  aria-busy={action.busy || undefined}
                  onClick={() => {
                    log.info('onRunBatchAction', 'run stage action', {
                      batchId: batch.id,
                    });
                    batchAction.onRun(batch.id);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--swap-modal-border)] text-[var(--swap-modal-accent)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {action.busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs text-xs"
              style={TOOLTIP_CONTENT_STYLE}
            >
              {action.tooltip ?? actionLabel}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ⚡2026-06-27 — per-row Check (`[✓]` slot). Mixes ONLY — the shared
            DefectCheckButton renders it (click → tab auto-selects the batch then
            enqueues the mix-detect job, 05-15 §4.1 / 05-11 §4). */}
        {batchDetectAction && (
          <DefectCheckButton
            scopeId={batch.id}
            scopeLabel={batch.name}
            detect={batchDetectAction.getState(batch)}
            onRun={batchDetectAction.onRun}
          />
        )}

        {/* [✕] remove batch — only when above BATCH_MIN */}
        {SHOW_REMOVE_BATCH && canRemoveBatch && (
          <button
            type="button"
            aria-label={`Xoá ${batch.name}`}
            disabled={anyJobRunning}
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
          {batch.crop_sheets.map((sheet, sheetIndex) => {
            const isActive =
              isActiveBatch && activeBatchRef?.sheetIndex === sheetIndex;
            // ⚡2026-06-26 — per-sheet crop count pill (mockup).
            const sheetCropCount = sheet.original_crops.length;
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
                <span className="min-w-0 flex-1 truncate font-medium">
                  Sheet {sheetIndex + 1}
                </span>
                {sheetCropCount > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums',
                      isActive
                        ? 'bg-[var(--swap-modal-accent)]/15 text-[var(--swap-modal-text-primary)]'
                        : 'bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-muted)]',
                    )}
                  >
                    {sheetCropCount} crops
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
