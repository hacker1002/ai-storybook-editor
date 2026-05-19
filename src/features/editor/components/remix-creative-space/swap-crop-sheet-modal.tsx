// swap-crop-sheet-modal.tsx — Full-screen workspace for reviewing + swapping
// crop sheets of every entity in a remix (design 05-swap-crop-sheet-modal.md).
//
// Layout — 4 regions:
//   RemixModalHeader      (tab group: Characters / Props / Mixes + close)
//   CropSheetEntitySidebar (left — entity list, sheet stepper, swap [⇄])
//   CropSheetStage         (center — compare toggle, zoom, sheet canvas)
//   SwapParametersSidebar  (right — swap/upscale model + scale, collect-only)
//
// Built on shadcn `Dialog` with `DialogContent` overridden to full-screen
// (inset-0, max-w-none, h-screen) — free focus-trap + Esc dismissal.
//
// DEFERRED boundary (Validation S1):
//  • The [⇄] swap button is hard-disabled on ALL tabs — the swap API is not
//    wired. `startEntitySwap` is a no-op stub and is NEVER called from the UI.
//  • v1 has no swap_results → `selectedSwap` is always null → Compare disabled.
//  • `entitySwapTasks` is always idle → busy/error overlays never show.
//  All those code paths are kept dormant so a future phase only fills the gap.
//  appendCropSheet / removeCropSheet (the [−][+] stepper) ARE fully functional.

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRemixEntities,
  useEntitySwapTask,
  useAnySwapRunning,
  useRemixActions,
  useRemixStore,
} from '@/stores/remix-store';
import { createLogger } from '@/utils/logger';
import type {
  SwapCropSheetTarget,
  RemixEntityRef,
  RemixCropSheet,
  SwapResult,
  SwapModelParams,
} from '@/types/remix';
import { RemixModalHeader } from './remix-modal-header';
import { CropSheetEntitySidebar } from './crop-sheet-entity-sidebar';
import { CropSheetStage } from './crop-sheet-stage';
import { SwapParametersSidebar } from './swap-parameters-sidebar';
import { RelayoutConfirmDialog } from './relayout-confirm-dialog';
import {
  DEFAULT_SWAP_PARAMS,
  ZOOM,
  SHEET_MIN,
  type RemixEntityType,
} from './swap-modal-constants';

const log = createLogger('Editor', 'SwapCropSheetModal');

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

interface ActiveSheetRef {
  entityKey: string;
  sheetIndex: number;
}

/** A stepper action ([+] add / [−] remove) deferred behind the relayout
 *  confirm dialog. `run()` is the actual mutation, invoked on confirm. */
interface PendingStepperAction {
  run: () => void;
}

/** True when ANY sheet of the entity already carries swap output — a relayout
 *  (add or remove) would wipe them all, so the action needs confirmation. */
function entityHasSwapResults(entity: RemixEntityRef): boolean {
  return entity.crop_sheets.some((s) => s.swap_results.length > 0);
}

/** Maps a tab id to its key in the `RemixEntities` projection. */
const TAB_TO_GROUP: Record<RemixEntityType, 'characters' | 'props' | 'mixes'> =
  {
    character: 'characters',
    prop: 'props',
    mix: 'mixes',
  };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  const entities = useRemixEntities(target.remixId);
  const remixName = useRemixStore(
    (s) => s.remixes.find((r) => r.id === target.remixId)?.name ?? '',
  );
  const { startEntitySwap, appendCropSheet, removeCropSheet } =
    useRemixActions();

  const [activeTab, setActiveTab] = useState<RemixEntityType>(target.type);
  const [activeSheetRef, setActiveSheetRef] = useState<ActiveSheetRef>({
    entityKey: target.key,
    sheetIndex: 0,
  });
  const [compareMode, setCompareMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM.default);
  const [dividerPosition, setDividerPosition] = useState(50);
  const [params, setParams] = useState<SwapModelParams>(DEFAULT_SWAP_PARAMS);
  // Stepper action awaiting relayout confirmation (null = dialog closed).
  const [pendingAction, setPendingAction] =
    useState<PendingStepperAction | null>(null);

  // Focus-restore — modal is mounted off `swapCropSheetTarget` state (no
  // DialogTrigger); the parent unmounts it abruptly. Capture the opener
  // ([👁]) on mount, restore focus to it on unmount.
  const triggerElRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    triggerElRef.current = document.activeElement as HTMLElement | null;
    return () => triggerElRef.current?.focus();
  }, []);

  // Remix deleted (realtime) → entities resolves null → close + notify.
  useEffect(() => {
    if (entities === null) {
      log.warn('render', 'remix resolved null — closing modal', {
        remixId: target.remixId,
      });
      toast.info('Remix đã bị xoá');
      onClose();
    }
  }, [entities, onClose, target.remixId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const tabEntities: RemixEntityRef[] =
    entities?.[TAB_TO_GROUP[activeTab]] ?? [];

  // Resolve active entity — fall back to first entity of the tab (handles a
  // missing target.key, edge case §4.11).
  const activeEntity: RemixEntityRef | null =
    tabEntities.find((e) => e.key === activeSheetRef.entityKey) ??
    tabEntities[0] ??
    null;

  // Clamp sheetIndex into range — a sheet may have been removed (§4.11).
  const sheetCount = activeEntity?.crop_sheets.length ?? 0;
  const safeSheetIndex =
    sheetCount > 0 ? clamp(activeSheetRef.sheetIndex, 0, sheetCount - 1) : 0;
  const activeSheet: RemixCropSheet | null =
    activeEntity?.crop_sheets[safeSheetIndex] ?? null;

  // Selected swap result — newest `is_selected`, fallback last. Always null in
  // v1 (no swap_results) but kept future-ready.
  const selectedSwap: SwapResult | null = activeSheet
    ? (activeSheet.swap_results.find((r) => r.is_selected) ??
      activeSheet.swap_results.at(-1) ??
      null)
    : null;

  const swapTask = useEntitySwapTask(
    target.remixId,
    activeTab,
    activeEntity?.key ?? '',
  );
  const anySwapRunning = useAnySwapRunning(target.remixId);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTabChange = (tab: RemixEntityType) => {
    log.debug('handleTabChange', 'switch tab', { from: activeTab, to: tab });
    setActiveTab(tab);
    const first = entities?.[TAB_TO_GROUP[tab]][0];
    setActiveSheetRef({ entityKey: first?.key ?? '', sheetIndex: 0 });
    setCompareMode(false);
    setZoomLevel(ZOOM.default);
  };

  const handleSelectSheet = (entityKey: string, sheetIndex: number) => {
    log.debug('handleSelectSheet', 'select sheet', { entityKey, sheetIndex });
    setActiveSheetRef({ entityKey, sheetIndex });
    setCompareMode(false);
    setDividerPosition(50);
    setZoomLevel(ZOOM.default);
  };

  // DEFERRED — swap [⇄] is hard-disabled on every tab; this never fires from
  // the UI. Kept as a guarded no-op so a future phase only flips the button.
  const handleSwapEntity = (entityKey: string) => {
    if (anySwapRunning) {
      log.debug('handleSwapEntity', 'skip: a swap is already running', {
        entityKey,
      });
      return;
    }
    log.info('handleSwapEntity', 'start entity swap', {
      type: activeTab,
      entityKey,
    });
    void startEntitySwap({
      remixId: target.remixId,
      type: activeTab,
      key: entityKey,
      params,
    });
  };

  // Gate a relayout-causing stepper action behind the confirm dialog when the
  // entity still has swap output (add + remove both relayout → wipe swaps).
  // Returns true if `action` ran immediately, false if it was deferred.
  const confirmRelayoutIfSwaps = (
    entity: RemixEntityRef,
    action: () => void,
  ): boolean => {
    if (!entityHasSwapResults(entity)) {
      action();
      return true;
    }
    log.debug('confirmRelayoutIfSwaps', 'defer action — entity has swaps', {
      entityKey: entity.key,
    });
    setPendingAction({ run: action });
    return false;
  };

  const handleAddSheet = (entityKey: string) => {
    const entity = tabEntities.find((e) => e.key === entityKey);
    if (!entity) {
      log.warn('handleAddSheet', 'entity not found — skip', { entityKey });
      return;
    }
    confirmRelayoutIfSwaps(entity, () => {
      log.info('handleAddSheet', 'append crop sheet', {
        type: activeTab,
        entityKey,
      });
      void appendCropSheet(target.remixId, activeTab, entityKey);
    });
  };

  const handleRemoveSheet = (entityKey: string, sheetIndex: number) => {
    const entity = tabEntities.find((e) => e.key === entityKey);
    if (!entity) {
      log.warn('handleRemoveSheet', 'entity not found — skip', { entityKey });
      return;
    }
    // Stepper already disables [−] at the floor, but guard defensively.
    if (entity.crop_sheets.length <= SHEET_MIN) {
      log.debug('handleRemoveSheet', 'skip: at sheet minimum', {
        entityKey,
        count: entity.crop_sheets.length,
      });
      return;
    }
    if (!entity.crop_sheets[sheetIndex]) {
      log.warn('handleRemoveSheet', 'sheet index out of range — skip', {
        entityKey,
        sheetIndex,
      });
      return;
    }

    confirmRelayoutIfSwaps(entity, () => {
      log.info('handleRemoveSheet', 'remove crop sheet', {
        type: activeTab,
        entityKey,
        sheetIndex,
      });
      void removeCropSheet(target.remixId, activeTab, entityKey, sheetIndex);

      // Clamp activeSheetRef if the removed sheet was at/after the active one.
      if (
        activeSheetRef.entityKey === entityKey &&
        activeSheetRef.sheetIndex >= sheetIndex
      ) {
        const nextIndex = Math.max(0, activeSheetRef.sheetIndex - 1);
        log.debug('handleRemoveSheet', 'clamp active sheet ref', {
          from: activeSheetRef.sheetIndex,
          to: nextIndex,
        });
        setActiveSheetRef({ entityKey, sheetIndex: nextIndex });
      }
    });
  };

  const handleConfirmRelayout = () => {
    log.info('handleConfirmRelayout', 'user confirmed relayout', {});
    pendingAction?.run();
    setPendingAction(null);
  };

  const handleCancelRelayout = () => {
    log.debug('handleCancelRelayout', 'user cancelled relayout', {});
    setPendingAction(null);
  };

  // entities === null is handled by the effect above (modal closes); render a
  // null tree for that single frame to avoid touching a stale projection.
  if (entities === null) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-labelledby="swap-crop-sheet-modal-title"
        // Full-screen override — neutralises the centered max-w-lg dialog and
        // hides the built-in close button ([&>button]:hidden), since the
        // header already owns the close control.
        className="inset-0 left-0 top-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          Remix — quản lý crop sheet
        </DialogTitle>
        <DialogDescription className="sr-only">
          Xem và quản lý crop sheet của từng nhân vật, đạo cụ và mix trong
          remix.
        </DialogDescription>

        <RemixModalHeader
          title={remixName || 'Remix'}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onClose={onClose}
        />

        <div className="flex min-h-0 flex-1">
          <CropSheetEntitySidebar
            remixId={target.remixId}
            type={activeTab}
            entities={tabEntities}
            activeSheetRef={{
              entityKey: activeEntity?.key ?? '',
              sheetIndex: safeSheetIndex,
            }}
            anySwapRunning={anySwapRunning}
            onSelectSheet={handleSelectSheet}
            onAddSheet={handleAddSheet}
            onRemoveSheet={handleRemoveSheet}
            onSwapEntity={handleSwapEntity}
          />

          <CropSheetStage
            sheet={activeSheet}
            selectedSwap={selectedSwap}
            compareMode={compareMode}
            zoomLevel={zoomLevel}
            dividerPosition={dividerPosition}
            swapTask={swapTask}
            onToggleCompare={() => setCompareMode((prev) => !prev)}
            onZoomChange={setZoomLevel}
            onDividerChange={setDividerPosition}
          />

          <SwapParametersSidebar params={params} onChange={setParams} />
        </div>

        <RelayoutConfirmDialog
          open={pendingAction !== null}
          onConfirm={handleConfirmRelayout}
          onCancel={handleCancelRelayout}
        />
      </DialogContent>
    </Dialog>
  );
}
