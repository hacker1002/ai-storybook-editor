// batches-tab.tsx — Batches tab of the rev2 swap modal (Phase 08).
//
// Presentational tab panel: Batch→Sheet sidebar (BatchesSidebar) + center
// CropSheetStage (mode='batches', Swap/Retry + Compare). All persisted data flows
// in via props (root owns the shared state + the actual startMixSwap / add /
// remove batch+sheet wiring). This tab only:
//   - derives the active batch / sheet / selected swap result,
//   - resolves the swap precondition (every enabled CHARACTER token must have a
//     visual_swap_url) via the read-only `useRemixVariants` selector,
//   - gates the Swap button + supplies the gating tooltip,
//   - guards DESTRUCTIVE actions (add sheet / remove sheet / remove batch) behind
//     a confirm dialog when the affected batch has ≥1 swap_result, because the
//     store relayouts + clears swap_results silently (Validation S1).
//
// SECURITY: never log media_url / swap URLs.

import { useCallback, useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';
import {
  useRemixById,
  useRemixVariants,
  useRemixActions,
} from '@/stores/remix-store';
import type { RemixBatch } from '@/types/remix';
import { missingCharRefs as resolveMissingCharRefs } from './batch-swap-gating';
import { CropSheetStage } from '../crop-sheet-stage';
import {
  RelayoutConfirmDialog,
  type RelayoutConfirmKind,
} from '../relayout-confirm-dialog';
import { useCollapseState } from '../sidebar/use-collapse-state';
import { useSelectedSwapCrops } from '../hooks/use-selected-swap-crops';
import { useCropOwnership } from '../hooks/use-crop-ownership';
import { BatchesSidebar } from './batches-sidebar';

const log = createLogger('Editor', 'BatchesTab');

export interface BatchesTabProps {
  remixId: string;
  batches: RemixBatch[];
  activeBatchRef: { batchId: string; sheetIndex: number } | null;
  submittingBatchId: string | null;
  anyMixSwapRunning: boolean;
  onSelectBatchSheet: (batchId: string, sheetIndex: number) => void;
  /** ⚡rev6 — set the modal-owned activeBatchRef after a successful subset
   *  Add Batch so the new batch (sheet 0) is auto-selected. Replaces the
   *  former modal-owned `onAddBatch` callback; selective Add Batch now lives
   *  inside this tab and consumes selection via `useSelectedSwapCrops`. */
  onActivateBatch: (ref: { batchId: string; sheetIndex: number }) => void;
  onRemoveBatch: (batchId: string) => void;
  onAddSheet: (batchId: string) => void;
  onRemoveSheet: (batchId: string, sheetIndex: number) => void;
  onSwapBatch: (batchId: string) => void;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  onToggleCompare: () => void;
  onZoomChange: (z: number) => void;
  onDividerChange: (p: number) => void;
}

/** A destructive action awaiting confirmation — invoked verbatim once the user
 *  confirms the relayout (deferred-action pattern). */
interface PendingAction {
  kind: RelayoutConfirmKind;
  batchName: string;
  run: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** True when any sheet of the batch carries ≥1 swap result. */
function batchHasSwapResults(batch: RemixBatch): boolean {
  return batch.crop_sheets.some((s) => s.swap_results.length > 0);
}

export function BatchesTab({
  remixId,
  batches,
  activeBatchRef,
  submittingBatchId,
  anyMixSwapRunning,
  onSelectBatchSheet,
  onActivateBatch,
  onRemoveBatch,
  onAddSheet,
  onRemoveSheet,
  onSwapBatch,
  compareMode,
  zoomLevel,
  dividerPosition,
  onToggleCompare,
  onZoomChange,
  onDividerChange,
}: BatchesTabProps) {
  const { isCollapsed, toggle: toggleCollapse } = useCollapseState();
  const [pending, setPending] = useState<PendingAction | null>(null);

  // ⚡rev6 — Subset Add Batch selection state lives in `<SelectionProvider>`
  // mounted by the modal (keyed-remount resets across batch switch + new
  // swap_results). The tab consumes via the hook, owns `handleAddBatch`.
  const {
    keys: selectedSwapCrops,
    toggle: toggleSwapCropSelection,
    clear: clearSwapCropSelection,
  } = useSelectedSwapCrops();
  const { addBatch, takeFinalBack } = useRemixActions();

  // Read-only variant projection for token → visual_swap_url resolution.
  const variantEntities = useRemixVariants(remixId);

  // ⚡rev7 — Cross-batch ownership resolution for the AFTER pane.
  const remix = useRemixById(remixId);
  const currentBatchId = activeBatchRef?.batchId ?? null;
  const { getOwnership } = useCropOwnership(remix, currentBatchId);

  const handleTakeBack = useCallback(
    (cropKey: string) => {
      if (!currentBatchId) {
        log.warn('handleTakeBack', 'no currentBatchId — ignore', { cropKey });
        return;
      }
      const sepIdx = cropKey.indexOf('/');
      if (sepIdx < 0) return;
      const spreadId = cropKey.slice(0, sepIdx);
      const layerId = cropKey.slice(sepIdx + 1);
      const ownership = getOwnership(cropKey);
      if (ownership.state !== 'owned-foreign') {
        log.debug('handleTakeBack', 'not foreign-owned — ignore', {
          cropKey,
          state: ownership.state,
        });
        return;
      }
      log.info('handleTakeBack', 'invoking takeFinalBack', {
        remixId,
        cropKey,
        ownerBatchId: ownership.ownerBatchId,
        targetBatchId: currentBatchId,
      });
      // ⚡rev7 fix — 4th arg = batch user is RECLAIMING ownership TO (= the
      // active/current batch), not the foreign owner. The type field is named
      // `fromBatchId` for "batch the user is taking back FROM the foreign
      // owner" — i.e. destination of the new winner. `applyTakeFinalBack`
      // sets `is_final=true` on the crop matching (spread,layer) inside this
      // batch and clears every other batch.
      takeFinalBack(remixId, spreadId, layerId, currentBatchId)
        .then((ok) => {
          if (!ok) toast.error('Could not take the final crop back.');
        })
        .catch((err) => {
          log.warn('handleTakeBack', 'rejected', {
            error: err instanceof Error ? err.message : String(err),
          });
          toast.error(
            err instanceof Error
              ? err.message
              : 'Could not take the final crop back.',
          );
        });
    },
    [remixId, currentBatchId, getOwnership, takeFinalBack],
  );

  // ── Derive active batch / sheet / sources (phase-08 §2) ────────────────────
  const batch = useMemo(
    () =>
      batches.find((b) => b.id === activeBatchRef?.batchId) ??
      batches[0] ??
      null,
    [batches, activeBatchRef],
  );
  const sheetCount = batch?.crop_sheets.length ?? 0;
  const sheetIndex =
    batch && sheetCount > 0
      ? clamp(activeBatchRef?.sheetIndex ?? 0, 0, sheetCount - 1)
      : 0;
  const sheet = batch?.crop_sheets[sheetIndex] ?? null;
  // rev6 — pass the full SwapResult through to the stage so it can compose the
  // AFTER side from `crops[]` (legacy single-image fallback when crops is empty
  // but `media_url` is present). Was: `selectedSwapUrl` (string only).
  const selectedSwap =
    sheet?.swap_results.find((s) => s.is_selected) ?? null;
  const swapTask = batch?.swapTask ?? { state: 'idle' as const };
  const isSubmitting = submittingBatchId != null && submittingBatchId === batch?.id;
  const isRunning = swapTask.state === 'running';

  // ── Precondition + gating (phase-08 §3 / spec §7.1/§7.2) ───────────────────
  // Pure resolver (batch-swap-gating.ts): the enabled-CHARACTER lineup tokens of
  // the batch that still lack a generated visual_swap_url. Props / disabled
  // subjects never gate. Empty → the character precondition is satisfied.
  const missingCharRefs = useMemo(
    () => (batch ? resolveMissingCharRefs(batch, variantEntities) : []),
    [batch, variantEntities],
  );

  const hasCrops = batch?.crop_sheets.some((s) => s.crops.length > 0) ?? false;
  const canSwap = batch != null && hasCrops && missingCharRefs.length === 0;
  const swapDisabled =
    !canSwap || anyMixSwapRunning || isSubmitting || isRunning;

  // Gating reason — ENGLISH per spec §7.2. PII-safe (no URLs / human data).
  const gateReason = useMemo<string | undefined>(() => {
    if (!batch) return 'Select a batch to swap';
    if (anyMixSwapRunning && !isSubmitting && !isRunning)
      return 'A swap is already running for this remix';
    if (!hasCrops) return 'This batch has no crops to swap';
    if (missingCharRefs.length > 0)
      return 'Generate a swapped visual for every character first — open the Variants tab';
    return undefined;
  }, [batch, anyMixSwapRunning, isSubmitting, isRunning, hasCrops, missingCharRefs]);

  log.debug('render', 'batches tab', {
    remixId,
    batchCount: batches.length,
    activeBatchId: batch?.id ?? null,
    sheetIndex,
    sheetCount,
    canSwap,
    missingCharCount: missingCharRefs.length,
    isSubmitting,
    isRunning,
  });

  // ── Destructive-action guard (deferred-action pattern, phase-08 §6) ────────
  // For add sheet / remove sheet / remove batch: if the affected batch has any
  // swap result, defer the real callback behind the confirm dialog. Otherwise
  // run it immediately. The pending action closes over the exact callback.
  const guardDestructive = (
    target: RemixBatch,
    kind: RelayoutConfirmKind,
    run: () => void,
  ) => {
    if (batchHasSwapResults(target)) {
      log.info('guardDestructive', 'defer destructive action — confirm', {
        batchId: target.id,
        kind,
      });
      setPending({ kind, batchName: target.name, run });
    } else {
      run();
    }
  };

  const findBatch = (batchId: string) =>
    batches.find((b) => b.id === batchId) ?? null;

  const handleAddSheet = (batchId: string) => {
    const target = findBatch(batchId);
    if (!target) return;
    guardDestructive(target, 'add-sheet', () => onAddSheet(batchId));
  };
  const handleRemoveSheet = (batchId: string, idx: number) => {
    const target = findBatch(batchId);
    if (!target) return;
    guardDestructive(target, 'remove-sheet', () => onRemoveSheet(batchId, idx));
  };
  const handleRemoveBatch = (batchId: string) => {
    const target = findBatch(batchId);
    if (!target) return;
    guardDestructive(target, 'remove-batch', () => onRemoveBatch(batchId));
  };

  const confirmPending = () => {
    if (!pending) return;
    log.info('confirmPending', 'run deferred destructive action', {
      kind: pending.kind,
    });
    pending.run();
    setPending(null);
  };
  const cancelPending = () => {
    log.debug('cancelPending', 'drop deferred destructive action', {});
    setPending(null);
  };

  const handleSwap = () => {
    if (!batch) return;
    log.info('handleSwap', 'request mix swap', { batchId: batch.id });
    onSwapBatch(batch.id);
  };

  // ── Selective Add Batch (rev6 §5.1) ────────────────────────────────────────
  // The Stage's per-crop checkbox overlay is enabled when a swap result is
  // selected, Compare is off, and no swap is in flight. The sidebar's [+]
  // button is gated additionally on a non-empty selection + no foreign swap
  // running (the active swap already implies `isRunning`/`isSubmitting`).
  const selectionSize = selectedSwapCrops.size;
  const stageSelectable =
    selectedSwap !== null && !compareMode && !isSubmitting && !isRunning;
  const canAddBatch =
    selectionSize > 0 && !isSubmitting && !isRunning && !anyMixSwapRunning;
  const addBatchTooltip =
    selectionSize === 0
      ? 'Tick the crops you want to redo first — checkboxes on each crop in the swap result'
      : anyMixSwapRunning
        ? 'Wait until the current swap finishes'
        : '';

  const handleAddBatch = useCallback(async () => {
    if (selectionSize === 0) {
      log.warn('handleAddBatch', 'empty selection — abort', {});
      return;
    }
    if (anyMixSwapRunning || isSubmitting || isRunning) {
      log.warn('handleAddBatch', 'busy — abort', {
        anyMixSwapRunning,
        isSubmitting,
        isRunning,
      });
      return;
    }
    const activeBatchId = activeBatchRef?.batchId;
    if (!activeBatchId) {
      log.warn('handleAddBatch', 'no active batch — abort', {});
      return;
    }

    log.info('handleAddBatch', 'start subset add batch', {
      activeBatchId,
      selectionSize,
    });

    try {
      const newBatchId = await addBatch(
        remixId,
        activeBatchId,
        selectedSwapCrops,
      );
      if (newBatchId === null) {
        log.error('handleAddBatch', 'addBatch returned null', {});
        toast.error("Couldn't add batch — try again");
        clearSwapCropSelection();
        return;
      }
      clearSwapCropSelection();
      onActivateBatch({ batchId: newBatchId, sheetIndex: 0 });
      log.info('handleAddBatch', 'success', { newBatchId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add batch';
      log.error('handleAddBatch', 'failed', { error: msg });
      toast.error(msg);
      clearSwapCropSelection();
    }
  }, [
    selectionSize,
    anyMixSwapRunning,
    isSubmitting,
    isRunning,
    activeBatchRef,
    addBatch,
    remixId,
    selectedSwapCrops,
    clearSwapCropSelection,
    onActivateBatch,
  ]);

  return (
    <>
      <BatchesSidebar
        batches={batches}
        activeBatchRef={activeBatchRef}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        anyMixSwapRunning={anyMixSwapRunning}
        canAddBatch={canAddBatch}
        addBatchTooltip={addBatchTooltip}
        selectionSize={selectionSize}
        onSelectBatchSheet={onSelectBatchSheet}
        onAddBatch={handleAddBatch}
        onRemoveBatch={handleRemoveBatch}
        onAddSheet={handleAddSheet}
        onRemoveSheet={handleRemoveSheet}
      />

      {batch ? (
        <CropSheetStage
          source={{ mode: 'batches', sheet, selectedSwap }}
          headerPrimary={{
            label: swapTask.state === 'error' ? 'Retry swap' : 'Swap',
            icon: Repeat,
            disabled: swapDisabled,
            tooltip: gateReason,
            busy: isSubmitting || isRunning,
            onClick: handleSwap,
          }}
          compareMode={compareMode}
          zoomLevel={zoomLevel}
          dividerPosition={dividerPosition}
          swapTask={swapTask}
          isSubmitting={isSubmitting}
          onToggleCompare={onToggleCompare}
          onZoomChange={onZoomChange}
          onDividerChange={onDividerChange}
          selectableSwapCrops={stageSelectable}
          selectedSwapCropKeys={selectedSwapCrops}
          onToggleSwapCropSelection={toggleSwapCropSelection}
          getOwnership={getOwnership}
          onTakeBack={handleTakeBack}
          takeBackDisabled={anyMixSwapRunning}
        />
      ) : (
        <section
          className="flex h-full min-w-0 flex-1 items-center justify-center bg-[var(--swap-modal-bg)] p-8 text-center"
          aria-label="Batches stage"
        >
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Thêm một batch để bắt đầu.
          </p>
        </section>
      )}

      <RelayoutConfirmDialog
        open={pending != null}
        kind={pending?.kind ?? 'remove-sheet'}
        batchName={pending?.batchName ?? ''}
        onConfirm={confirmPending}
        onCancel={cancelPending}
      />
    </>
  );
}
