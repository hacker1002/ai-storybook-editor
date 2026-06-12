// batches-tab.tsx — Stage tab instance `'mixes'` (UI label **Crops** —
// ⚡2026-06-12 pipeline). Thin wrapper around the shared `useStageBatchTab`
// hook (05-11): everything generic (sidebar, rev6 tick-flow, rev7 ownership,
// destructive confirm, gating skeleton) lives in the hook. THIS file owns only
// the per-stage parts:
//   - precondition: every enabled CHARACTER lineup token must have a sprite
//     final (`visual_swap_url`) — resolved via `useRemixVariants` (05-08 §7),
//   - the Settings header button (read-only remix-config review — 05-10),
//   - composeMode 'ordinal' / afterComposeMode 'crops-or-sheet' (from config).
//
// SECURITY: never log media_url / swap URLs.

import { useCallback, useState } from 'react';
import { Repeat, Settings2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  useRemixById,
  useRemixVariants,
} from '@/stores/remix-store';
import { useHumans } from '@/stores/humans-store';
import type { RemixStageBatch } from '@/types/remix';
import { missingCharRefs as resolveMissingCharRefs } from './batch-swap-gating';
import { CropSheetStage } from '../crop-sheet-stage';
import { RelayoutConfirmDialog } from '../relayout-confirm-dialog';
import { SwapConfigReviewModal } from '../swap-config-review-modal';
import {
  useStageBatchTab,
  type StageBatchTabProps,
  type StageGateResult,
} from './use-stage-batch-tab';
import { BatchesSidebar } from './batches-sidebar';

const log = createLogger('Editor', 'BatchesTab');

export type BatchesTabProps = StageBatchTabProps;

export function BatchesTab(props: StageBatchTabProps) {
  const { remixId } = props;
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

  log.debug('render', 'crops tab (mixes)', {
    remixId,
    batchCount: props.batches.length,
    activeBatchId: t.batch?.id ?? null,
    actionDisabled: t.actionDisabled,
    isSubmitting: t.isSubmitting,
    isRunning: t.isRunning,
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
        onSelectBatchSheet={props.onSelectBatchSheet}
        onAddBatch={t.handleAddBatch}
        onRemoveBatch={t.handleRemoveBatchGuarded}
        onAddSheet={t.handleAddSheetGuarded}
        onRemoveSheet={t.handleRemoveSheetGuarded}
      />

      {t.batch ? (
        <CropSheetStage
          source={{ mode: 'batches', sheet: t.sheet, selectedSwap: t.selectedSwap }}
          headerPrimary={{
            label: t.swapTask.state === 'error' ? 'Retry swap' : t.cfg.actionLabel,
            icon: Repeat,
            disabled: t.actionDisabled,
            tooltip: t.gateReason,
            busy: t.isSubmitting || t.isRunning,
            onClick: t.handleStartJob,
          }}
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
