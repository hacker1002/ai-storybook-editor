// batches-tab.tsx — Stage tab instance `'mixes'` (UI label **Crops** —
// ⚡2026-06-12 pipeline). Thin wrapper around the shared `useStageBatchTab`
// hook (05-11): everything generic (sidebar, rev6 tick-flow, rev7 ownership,
// destructive confirm, gating skeleton) lives in the hook. THIS file owns only
// the per-stage parts:
//   - precondition: every enabled CHARACTER lineup token must have a sprite
//     final (`visual_swap_url`) — resolved via `useRemixVariants` (05-08 §7),
//   - the Settings header button (read-only remix-config review — 05-10),
//   - composeMode 'ordinal' / afterComposeMode 'crops-or-sheet' (from config),
//   - ⚡2026-06-27 the mix-plane swap-defect Check (`[✓]` slot + DefectOverlay,
//     05-15 — mixes only, `cfg.hasDetect`).
//
// SECURITY: never log media_url / swap URLs / defect message.

import { useCallback, useState } from 'react';
import { Repeat, Settings2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  useRemixById,
  useRemixVariants,
  useJobsForRemix,
  deriveDetectView,
} from '@/stores/remix-store';
import { useDefectDetection } from '@/features/editor/hooks/use-defect-detection';
import { useHumans } from '@/stores/humans-store';
import type { RemixStageBatch } from '@/types/remix';
import { missingCharRefs as resolveMissingCharRefs } from './batch-swap-gating';
import { CropSheetStage } from '../crop-sheet-stage';
import { RelayoutConfirmDialog } from '../relayout-confirm-dialog';
import { SwapConfigReviewModal } from '../swap-config-review-modal';
import { evaluateDetect, type DetectActionState } from './detect-gating';
import { DETECT_PLANE_CONFIG } from '../detect-plane-config';
import {
  useStageBatchTab,
  type StageBatchTabProps,
  type StageGateResult,
} from './use-stage-batch-tab';
import { BatchesSidebar } from './batches-sidebar';

const log = createLogger('Editor', 'BatchesTab');

/** Mixes tab = the shared stage props + the mix-plane detect (Check) wiring.
 *  The detect props are mixes-ONLY (rmbg/upscale tabs never receive them →
 *  no `[✓]` slot, no overlay). */
export interface BatchesTabProps extends StageBatchTabProps {
  /** batch_id currently POSTing a mix-detect (mirror submittingBatchId). */
  submittingDetectBatchId: string | null;
  /** True while ANY mix-detect job runs for the remix (dedup = 1/remix/plane). */
  anyDetectRunning: boolean;
  /** Enqueue a mix swap-defect detect job for the batch (Check). */
  onDetectBatch: (batchId: string) => void;
}

export function BatchesTab(props: BatchesTabProps) {
  const { remixId, submittingDetectBatchId, anyDetectRunning } = props;
  // Read-only variant projection for token → visual_swap_url resolution.
  const variantEntities = useRemixVariants(remixId);
  // Settings review dialog (frozen remix_config — chars + props).
  const remix = useRemixById(remixId);
  const humans = useHumans();
  const [reviewOpen, setReviewOpen] = useState(false);

  // Per-stage precondition (05-08 §7): every enabled CHARACTER token in the
  // batch lineup must carry a generated sprite final. Props never gate.
  const precondition = useCallback(
    (batch: RemixStageBatch): StageGateResult => {
      const missing = resolveMissingCharRefs(batch, variantEntities);
      if (missing.length > 0) {
        return {
          ok: false,
          reason:
            'Generate a swapped visual for every character first — open the Variants tab',
        };
      }
      return { ok: true };
    },
    [variantEntities],
  );

  const t = useStageBatchTab('mixes', props, precondition);

  // ── Detect (Check) — active-batch overlay source + per-row gating (05-15) ────
  // Generic `useDefectDetection('mix', …)` derives the active batch's detect view
  // (the overlay reads the SHEET being viewed); the per-row evaluator derives
  // each batch inline via the pure `deriveDetectView` (no hook in a loop).
  const jobs = useJobsForRemix(remixId);
  const activeBatchId = t.batch?.id ?? null;
  const activeDetect = useDefectDetection('mix', remixId, activeBatchId);
  const detectSheetResult =
    activeDetect.defectsBySheet.find((d) => d.sheet_index === t.sheetIndex) ?? null;
  const detectDefects = detectSheetResult?.defects ?? [];
  const detectSwappedDim = detectSheetResult?.swappedDimensions ?? null;
  // Stale guard (defects ephemeral): overlay valid only when the detect ran
  // AFTER the swap result currently shown (jobCreatedAt > selectedSwap.created_time).
  const detectOverlayStale =
    !activeDetect.jobCreatedAt ||
    t.selectedSwap === null ||
    !(activeDetect.jobCreatedAt > t.selectedSwap.created_time);
  const detectOverlayVisible =
    t.selectedSwap !== null &&
    detectDefects.length > 0 &&
    !props.compareMode &&
    !detectOverlayStale;
  const detectProgress =
    activeDetect.task.state === 'running'
      ? { current: activeDetect.task.current, total: activeDetect.task.total }
      : null;

  // Per-row Check evaluator (pure; mix plane). `anySwapRunning = anyJobRunning`
  // (the mixes stage mutex, host-resolved); `anyDetectRunning` disables every
  // mix Check (mix detect dedups 1/remix, independent of sprite detect).
  const evaluateBatchDetectRow = useCallback(
    (b: RemixStageBatch): DetectActionState =>
      evaluateDetect(
        b,
        deriveDetectView(jobs, remixId, b.id, DETECT_PLANE_CONFIG.mix.jobType),
        {
          submittingScopeId: submittingDetectBatchId,
          anySwapRunning: props.anyJobRunning,
          anyDetectRunning,
        },
      ),
    [jobs, remixId, submittingDetectBatchId, props.anyJobRunning, anyDetectRunning],
  );

  // Per-row Check: select that batch (so the stage overlay tracks ITS sheet)
  // then enqueue the detect job. Preserve the active sheet when re-checking the
  // already-selected batch; else start at sheet 0. Mirror `handleStartBatchJob`.
  const { onSelectBatchSheet, onDetectBatch, activeBatchRef } = props;
  const handleDetectBatch = useCallback(
    (batchId: string) => {
      const sheetIndex =
        activeBatchRef && activeBatchRef.batchId === batchId
          ? activeBatchRef.sheetIndex
          : 0;
      log.info('handleDetectBatch', 'select + detect batch', { batchId });
      onSelectBatchSheet(batchId, sheetIndex);
      onDetectBatch(batchId);
    },
    [activeBatchRef, onSelectBatchSheet, onDetectBatch],
  );

  log.debug('render', 'crops tab (mixes)', {
    remixId,
    batchCount: props.batches.length,
    activeBatchId,
    isSubmitting: t.isSubmitting,
    isRunning: t.isRunning,
    detectVisible: detectOverlayVisible,
  });

  return (
    <>
      <BatchesSidebar
        batches={props.batches}
        activeBatchRef={props.activeBatchRef}
        isCollapsed={t.collapse.isCollapsed}
        onToggleCollapse={t.collapse.toggle}
        anyJobRunning={props.anyJobRunning}
        canAddBatch={t.canAddBatch}
        addBatchTooltip={t.addBatchTooltip}
        selectionSize={t.selectionSize}
        batchAction={{
          icon: Repeat,
          label: t.cfg.actionLabel,
          retryLabel: 'Retry swap',
          getState: t.evaluateBatchAction,
          onRun: t.handleStartBatchJob,
        }}
        batchDetectAction={
          t.cfg.hasDetect
            ? { getState: evaluateBatchDetectRow, onRun: handleDetectBatch }
            : undefined
        }
        onSelectBatchSheet={props.onSelectBatchSheet}
        onAddBatch={t.handleAddBatch}
        onRemoveBatch={t.handleRemoveBatchGuarded}
        onAddSheet={t.handleAddSheetGuarded}
        onRemoveSheet={t.handleRemoveSheetGuarded}
      />

      {t.batch ? (
        <CropSheetStage
          source={{ mode: 'batches', sheet: t.sheet, selectedSwap: t.selectedSwap }}
          headerActions={
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                log.debug('onClick', 'open config review modal', {});
                setReviewOpen(true);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
                'border-[var(--swap-modal-border)] text-[var(--swap-modal-text-muted)]',
                'hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]',
              )}
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Settings
            </button>
          }
          compareMode={props.compareMode}
          zoomLevel={props.zoomLevel}
          dividerPosition={props.dividerPosition}
          swapTask={t.swapTask}
          isSubmitting={t.isSubmitting}
          composeMode={t.cfg.composeMode}
          afterComposeMode={t.cfg.afterComposeMode}
          runningLabel={t.runningLabel}
          submittingLabel={t.submittingLabel}
          onToggleCompare={props.onToggleCompare}
          onZoomChange={props.onZoomChange}
          onDividerChange={props.onDividerChange}
          selectableSwapCrops={t.stageSelectable}
          selectedSwapCropKeys={t.selectedSwapCrops}
          onToggleSwapCropSelection={t.toggleSwapCropSelection}
          getOwnership={t.getOwnership}
          onTakeBack={t.handleTakeBack}
          takeBackDisabled={props.anyJobRunning}
          defectOverlay={{
            defects: detectDefects,
            swappedDimensions: detectSwappedDim,
            visible: detectOverlayVisible,
          }}
          detectProgress={detectProgress}
        />
      ) : (
        <section
          className="flex h-full min-w-0 flex-1 items-center justify-center bg-[var(--swap-modal-bg)] p-8 text-center"
          aria-label="Crops stage"
        >
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Thêm một batch để bắt đầu.
          </p>
        </section>
      )}

      <RelayoutConfirmDialog
        open={t.pending != null}
        kind={t.pending?.kind ?? 'remove-sheet'}
        batchName={t.pending?.batchName ?? ''}
        onConfirm={t.confirmPending}
        onCancel={t.cancelPending}
      />

      {remix && (
        <SwapConfigReviewModal
          open={reviewOpen}
          remix={remix}
          humans={humans}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </>
  );
}
