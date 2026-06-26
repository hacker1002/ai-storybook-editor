// rmbg-tab.tsx — Stage tab instance `'rmbgs'` (UI label **Remove BG** —
// ⚡2026-06-12 pipeline stage 2, design 05-12). Thin wrapper around the shared
// `useStageBatchTab` hook (05-11). Per-stage parts only:
//   - NO auto-seed: 0 batches → empty-state CTA "Import from previous stage",
//   - Import header button (finals of `mixes[]` → ImportBatchModal — 05-14),
//   - default precondition (batch has crops — job 09 needs no sprite finals),
//   - composeMode 'plain' / afterComposeMode 'sheet-or-crops' (RGBA fast path).
//
// SECURITY: never log media_url / swap URLs (crops are PII likenesses).

import { Eraser } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { CropSheetStage } from '../crop-sheet-stage';
import { RelayoutConfirmDialog } from '../relayout-confirm-dialog';
import {
  useStageBatchTab,
  type StageBatchTabProps,
} from './use-stage-batch-tab';
import { BatchesSidebar } from './batches-sidebar';
import { StageBatchEmptyState } from './stage-batch-empty-state';
import { StageImportButton } from './stage-import-button';

const log = createLogger('Editor', 'RmbgTab');

/** `onOpenImport` is REQUIRED for this instance (root 05 §3.4). */
export type RmbgTabProps = StageBatchTabProps;

export function RmbgTab(props: RmbgTabProps) {
  const t = useStageBatchTab('rmbgs', props);

  log.debug('render', 'remove-bg tab (rmbgs)', {
    remixId: props.remixId,
    batchCount: props.batches.length,
    activeBatchId: t.batch?.id ?? null,
    importDisabled: t.importDisabled,
  });

  return (
    <>
      <BatchesSidebar
        batches={props.batches}
        activeBatchRef={props.activeBatchRef}
        isCollapsed={t.collapse.isCollapsed}
        onToggleCollapse={t.collapse.toggle}
        anyJobRunning={props.anyJobRunning}
        allowZeroBatch
        canAddBatch={t.canAddBatch}
        addBatchTooltip={t.addBatchTooltip}
        selectionSize={t.selectionSize}
        batchAction={{
          icon: Eraser,
          label: t.cfg.actionLabel,
          retryLabel: 'Retry Remove BG',
          getState: t.evaluateBatchAction,
          onRun: t.handleStartBatchJob,
        }}
        onSelectBatchSheet={props.onSelectBatchSheet}
        onAddBatch={t.handleAddBatch}
        onRemoveBatch={t.handleRemoveBatchGuarded}
        onAddSheet={t.handleAddSheetGuarded}
        onRemoveSheet={t.handleRemoveSheetGuarded}
      />

      {props.batches.length === 0 ? (
        // No auto-seed on this stage — first batch arrives via Import.
        <StageBatchEmptyState
          stageLabel={t.cfg.label}
          disabled={t.importDisabled}
          disabledTooltip={t.importTooltip}
          onImport={() => props.onOpenImport?.()}
        />
      ) : t.batch ? (
        <CropSheetStage
          source={{ mode: 'batches', sheet: t.sheet, selectedSwap: t.selectedSwap }}
          headerActions={
            <StageImportButton
              disabled={t.importDisabled}
              disabledTooltip={t.importTooltip}
              onOpenImport={() => props.onOpenImport?.()}
            />
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
          aria-label="Remove BG stage"
        >
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Chọn một batch để bắt đầu.
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
    </>
  );
}
