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
// (inset-0, max-w-none, h-screen) — free focus-trap + Esc dismissal. Dark
// theme tokens (Phase 03) applied via inline CSS variables on DialogContent.
//
// Phase 06 — variant-scoped:
//  • `activeSheetRef` includes `variantKey: string | null` (null = mix scope).
//  • sheetIndex stored in `activeSheetRef` is LOCAL to the variant bucket for
//    char/prop entities (not the global crop_sheets[] index); for mix it IS
//    the global index (single bucket).
//  • Relayout confirm scoped to the variant being mutated (not whole entity).
//  • VariantsVisualModal (Phase 05) rendered conditionally on `variantsModalFor`.
//
// Character swap ([⇄]):
//  • Char-only v1 — `handleSwapEntity` enqueues the character crop-sheet swap
//    job (api/jobs/04) via `startEntitySwap`; props/mixes stay disabled.
//  • Busy/error overlays + swap_results derive from the realtime `jobs[]` slice
//    (`useEntitySwapTask`); Compare unlocks once a sheet carries swap_results.
//  • appendCropSheet / removeCropSheet (the [−][+] stepper) are independent.

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useInteractionLayer } from '@/features/editor/contexts';
import { EnqueueJobError } from '@/apis/jobs-api';
import { createLogger } from '@/utils/logger';
import type {
  SwapCropSheetTarget,
  RemixEntityRef,
  RemixCropSheet,
  RemixVariantGroup,
  SwapResult,
  SwapModelParams,
} from '@/types/remix';
import { RemixModalHeader } from './remix-modal-header';
import { CropSheetEntitySidebar } from './crop-sheet-entity-sidebar';
import { CropSheetStage } from './crop-sheet-stage';
import { SwapParametersSidebar } from './swap-parameters-sidebar';
import { RelayoutConfirmDialog } from './relayout-confirm-dialog';
import { VariantsVisualModal } from './variants-visual-modal';
import {
  DEFAULT_SWAP_PARAMS,
  SWAP_MODAL_TOKENS,
  Z_INDEX,
  ZOOM,
  SHEET_MIN,
  type RemixEntityType,
} from './swap-modal-constants';
import type { RemixEntities } from '@/stores/remix-store/types';

const log = createLogger('Editor', 'SwapCropSheetModal');

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

/** Active sheet pointer. `variantKey` is null for mix entities (single bucket);
 *  for char/prop it's the bucket key. `sheetIndex` is LOCAL to the variant
 *  bucket (char/prop) or to entity.crop_sheets[] (mix). */
interface ActiveSheetRef {
  entityKey: string;
  variantKey: string | null;
  sheetIndex: number;
}

/** A stepper action ([+] add / [−] remove) deferred behind the relayout
 *  confirm dialog. `run()` is the actual mutation, invoked on confirm.
 *  `variantName` carries the human-readable label for the confirm message
 *  (Phase 07 consumes — pass even before the dialog uses it). */
interface PendingStepperAction {
  run: () => void;
  variantName?: string;
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

/** Picks the initial active-sheet pointer when the modal first opens or after
 *  a tab change. For char/prop tabs, anchors to the first variant of the
 *  target entity (variantKey = first variant's key); for mix, variantKey=null.
 *  Falls back to an empty ref when entities haven't resolved yet. */
function initialSheetRef(
  target: SwapCropSheetTarget,
  entities: RemixEntities | null,
): ActiveSheetRef {
  if (!entities) {
    return { entityKey: target.key, variantKey: null, sheetIndex: 0 };
  }
  const group = entities[TAB_TO_GROUP[target.type]];
  const entity = group.find((e) => e.key === target.key) ?? group[0];
  if (!entity) {
    return { entityKey: target.key, variantKey: null, sheetIndex: 0 };
  }
  const firstVariant =
    target.type === 'mix' ? null : entity.variants[0]?.variantKey ?? null;
  return {
    entityKey: entity.key,
    variantKey: firstVariant,
    sheetIndex: 0,
  };
}

/** Returns true when any sheet of the entity that belongs to `variantKey`
 *  carries swap output — a relayout scoped to that variant would wipe them.
 *  Null `variantKey` (mix entity) filters naturally — mix sheets always have
 *  `variant_key: null`. */
function variantHasSwapResults(
  entity: RemixEntityRef,
  variantKey: string | null,
): boolean {
  return entity.crop_sheets.some(
    (s) => s.variant_key === variantKey && s.swap_results.length > 0,
  );
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  const entities = useRemixEntities(target.remixId);
  const remixName = useRemixStore(
    (s) => s.remixes.find((r) => r.id === target.remixId)?.name ?? '',
  );
  const { appendCropSheet, removeCropSheet, startEntitySwap } =
    useRemixActions();

  const [activeTab, setActiveTab] = useState<RemixEntityType>(target.type);
  const [activeSheetRef, setActiveSheetRef] = useState<ActiveSheetRef>(() =>
    initialSheetRef(target, entities),
  );
  const [variantsModalFor, setVariantsModalFor] = useState<string | null>(null);
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

  // DialogContent ref — wired into ILS so click-outside detection knows the
  // modal's bounds. Stable across renders.
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // ILS modal-slot registration. Yields the slot to VariantsVisualModal when
  // that child overlay is open — ILS routes Esc + click-outside to whichever
  // layer currently owns the slot. The child registers with `yieldedFrom`
  // linkage so cascade force-pops propagate back to us via `onClose`.
  //
  // Stable `onClose` ref — handlers in ILS reference `layerRef.current` so a
  // changing `onClose` identity does not re-register, but capture it via
  // useCallback for parity with the rest of the file's style.
  const handleEscOrClickOutside = useCallback(() => {
    log.debug('handleEscOrClickOutside', 'esc/click-outside closes modal', {});
    onClose();
  }, [onClose]);

  useInteractionLayer(
    'modal',
    variantsModalFor === null
      ? {
          id: 'swap-crop-sheet-modal',
          ref: dialogContentRef,
          hotkeys: ['Escape'],
          onHotkey: (key) => {
            if (key === 'Escape') handleEscOrClickOutside();
          },
          onClickOutside: handleEscOrClickOutside,
          captureClickOutside: true,
          // Radix Select / Popper / Tooltip portals targeted inside this
          // modal — treat clicks inside them as "click inside this layer".
          portalSelectors: [
            '[data-radix-popper-content-wrapper]',
            '[data-radix-select-content]',
            '[role="listbox"]',
          ],
        }
      : null,
  );

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

  // Resolve active variant. Mix entity ⇒ null. Otherwise: find by key, else
  // fall back to first variant of the entity (variant deleted or stale ref).
  const activeVariant: RemixVariantGroup | null =
    activeTab === 'mix' || !activeEntity
      ? null
      : activeEntity.variants.find(
          (v) => v.variantKey === activeSheetRef.variantKey,
        ) ??
        activeEntity.variants[0] ??
        null;

  // Sheet indices visible at the active scope.
  //  • char/prop with variants → variant.sheetIndices
  //  • char/prop with no variants → all entity.crop_sheets (defensive fallback;
  //    selectors layer's `withSyntheticBaseFallback` should prevent this)
  //  • mix → all entity.crop_sheets indices
  const variantSheetIndices: number[] =
    activeVariant?.sheetIndices ??
    activeEntity?.crop_sheets.map((_, i) => i) ??
    [];

  // Clamp the LOCAL index into the variant scope. `safeSheetLocalIdx` is
  // 0..(variantSheetIndices.length-1) or 0 when the variant has no sheets.
  const safeSheetLocalIdx =
    variantSheetIndices.length > 0
      ? clamp(activeSheetRef.sheetIndex, 0, variantSheetIndices.length - 1)
      : 0;

  // Resolve to global index into entity.crop_sheets[]. Null when variant is
  // empty.
  const resolvedSheetIdx: number | null =
    variantSheetIndices.length > 0
      ? variantSheetIndices[safeSheetLocalIdx] ?? null
      : null;

  const activeSheet: RemixCropSheet | null =
    resolvedSheetIdx !== null
      ? activeEntity?.crop_sheets[resolvedSheetIdx] ?? null
      : null;

  // Selected swap result — newest `is_selected`, fallback last. Always null in
  // v1 (no swap_results) but kept future-ready.
  const selectedSwap: SwapResult | null = activeSheet
    ? activeSheet.swap_results.find((r) => r.is_selected) ??
      activeSheet.swap_results.at(-1) ??
      null
    : null;

  const swapTask = useEntitySwapTask(
    target.remixId,
    activeTab,
    activeEntity?.key ?? '',
  );
  const anySwapRunning = useAnySwapRunning(target.remixId);

  // Immediate click feedback: the running state derives from jobs[], but the
  // optimistic seed only lands AFTER the enqueue POST resolves — so for the
  // in-flight window there'd be no visual cue. `submittingKey` marks the entity
  // whose swap POST is in flight (set synchronously on click, cleared in
  // `finally`), so the button disables + a "Starting…" indicator shows at once.
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  // Effective busy = a job is running OR an enqueue POST is in flight. Disables
  // every [⇄] during the gap so a second click can't double-submit.
  const swapBusy = anySwapRunning || submittingKey !== null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTabChange = (tab: RemixEntityType) => {
    log.debug('handleTabChange', 'switch tab', { from: activeTab, to: tab });
    setActiveTab(tab);
    const first = entities?.[TAB_TO_GROUP[tab]][0];
    const firstVariant =
      tab === 'mix' ? null : first?.variants[0]?.variantKey ?? null;
    setActiveSheetRef({
      entityKey: first?.key ?? '',
      variantKey: firstVariant,
      sheetIndex: 0,
    });
    setCompareMode(false);
    // No zoom reset — StageCanvas measures the new sheet and reports its
    // fit zoom via onZoomChange (design 05-03 §4.3).
  };

  const handleSelectVariant = (entityKey: string, variantKey: string) => {
    log.debug('handleSelectVariant', 'select variant', {
      entityKey,
      variantKey,
    });
    setActiveSheetRef({ entityKey, variantKey, sheetIndex: 0 });
    setCompareMode(false);
    setDividerPosition(50);
  };

  const handleSelectSheet = (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => {
    log.debug('handleSelectSheet', 'select sheet', {
      entityKey,
      variantKey,
      sheetIndex,
    });
    setActiveSheetRef({ entityKey, variantKey, sheetIndex });
    setCompareMode(false);
    setDividerPosition(50);
  };

  const handleOpenVariants = (entityKey: string) => {
    log.info('handleOpenVariants', 'open variants modal', { entityKey });
    setVariantsModalFor(entityKey);
  };

  // Enqueue the character crop-sheet swap job (api/jobs/04). Char-only v1 —
  // props/mixes are disabled at the button; the guards here are defensive
  // (hotkey/programmatic — memory feedback_sidebar_destructive_hotkeys). The
  // store action no-ops type!=='character' and a busy remix; 422
  // MISSING_VARIANT_REFERENCE surfaces as an EnqueueJobError → distinct toast.
  const handleSwapEntity = async (entityKey: string) => {
    if (activeTab !== 'character') {
      log.debug('handleSwapEntity', 'unsupported type — ignore', {
        entityKey,
        type: activeTab,
      });
      return;
    }
    if (swapBusy) {
      log.debug('handleSwapEntity', 'swap busy (running or submitting) — ignore', {
        entityKey,
      });
      return;
    }
    const entity = tabEntities.find((e) => e.key === entityKey);
    if (!entity) {
      log.warn('handleSwapEntity', 'entity not found — ignore', { entityKey });
      return;
    }
    // Client precondition (api/jobs/04): every in-scope variant must have a
    // visual reference. Mirrors the button disable matrix — fail loud if reached.
    if (
      entity.variants.length === 0 ||
      entity.variants.some((v) => v.visualSwapUrl == null)
    ) {
      log.warn('handleSwapEntity', 'missing variant visual — block', {
        entityKey,
      });
      toast.error('Some variants are missing a swapped visual');
      return;
    }

    setSubmittingKey(entityKey);
    try {
      const outcome = await startEntitySwap({
        remixId: target.remixId,
        type: 'character',
        key: entityKey,
        params,
        forceResweep: false,
      });
      log.info('handleSwapEntity', 'enqueue outcome', {
        entityKey,
        kind: outcome.kind,
      });
      if (outcome.kind === 'skipped') {
        if (outcome.reason === 'all_sheets_already_swapped') {
          toast.info('All sheets are already swapped');
        } else if (outcome.reason === 'no_crop_sheets') {
          toast.info('No crop sheets to swap');
        }
        // 'busy' / 'unsupported_type' are silent (button already guards them).
      } else if (outcome.kind === 'deduped') {
        toast.info('A swap is already running for this remix');
      } else {
        toast.success('Character swap started');
      }
    } catch (err) {
      const code =
        err instanceof EnqueueJobError ? err.code : undefined;
      log.error('handleSwapEntity', 'enqueue failed', { entityKey, code });
      if (code === 'MISSING_VARIANT_REFERENCE') {
        toast.error('Some variants are missing a swapped visual');
      } else {
        toast.error("Couldn't start swap — try again");
      }
    } finally {
      // On the enqueued path the optimistic seed is already in jobs[] by now, so
      // swapTask='running' takes over seamlessly. On skip/dedup/error we just
      // release the in-flight lock.
      setSubmittingKey(null);
    }
  };

  // Gate a relayout-causing stepper action behind the confirm dialog when the
  // entity's TARGET VARIANT still has swap output. Variant-scoped (not whole
  // entity) per spec §4.2. Returns true if `action` ran immediately, false if
  // it was deferred.
  const confirmRelayoutIfSwapsScopedToVariant = (
    entity: RemixEntityRef,
    variantKey: string | null,
    action: () => void,
  ): boolean => {
    if (!variantHasSwapResults(entity, variantKey)) {
      action();
      return true;
    }
    const variantName =
      variantKey !== null
        ? entity.variants.find((v) => v.variantKey === variantKey)?.name
        : undefined;
    log.debug(
      'confirmRelayoutIfSwapsScopedToVariant',
      'defer action — variant has swaps',
      { entityKey: entity.key, variantKey, variantName },
    );
    setPendingAction({ run: action, variantName });
    return false;
  };

  const handleAddSheet = (entityKey: string, variantKey: string | null) => {
    const entity = tabEntities.find((e) => e.key === entityKey);
    if (!entity) {
      log.warn('handleAddSheet', 'entity not found — skip', {
        entityKey,
        variantKey,
      });
      return;
    }
    confirmRelayoutIfSwapsScopedToVariant(entity, variantKey, () => {
      log.info('handleAddSheet', 'append crop sheet', {
        type: activeTab,
        entityKey,
        variantKey,
      });
      void appendCropSheet(target.remixId, activeTab, entityKey, variantKey);
    });
  };

  const handleRemoveSheet = (
    entityKey: string,
    variantKey: string | null,
    sheetIndex: number,
  ) => {
    const entity = tabEntities.find((e) => e.key === entityKey);
    if (!entity) {
      log.warn('handleRemoveSheet', 'entity not found — skip', {
        entityKey,
        variantKey,
      });
      return;
    }

    // Resolve the variant bucket. char/prop uses entity.variants; mix passes
    // null and walks entity.crop_sheets directly.
    const variantGroup =
      activeTab === 'mix'
        ? null
        : entity.variants.find((v) => v.variantKey === variantKey) ?? null;

    // Flat index into entity.crop_sheets[] used by the store action.
    const flatIndex = variantGroup
      ? variantGroup.sheetIndices[sheetIndex]
      : sheetIndex;

    if (flatIndex === undefined || !entity.crop_sheets[flatIndex]) {
      log.warn('handleRemoveSheet', 'sheet index out of range — skip', {
        entityKey,
        variantKey,
        sheetIndex,
      });
      return;
    }

    // SHEET_MIN guard scoped to the variant bucket (char/prop) or the whole
    // entity (mix). Stepper already disables [−] at the floor, but guard
    // defensively.
    const targetCount = variantGroup
      ? variantGroup.sheetIndices.length
      : entity.crop_sheets.length;
    if (targetCount <= SHEET_MIN) {
      log.debug('handleRemoveSheet', 'skip: at sheet minimum', {
        entityKey,
        variantKey,
        targetCount,
      });
      return;
    }

    confirmRelayoutIfSwapsScopedToVariant(entity, variantKey, () => {
      log.info('handleRemoveSheet', 'remove crop sheet', {
        type: activeTab,
        entityKey,
        variantKey,
        sheetIndex,
        flatIndex,
      });
      void removeCropSheet(
        target.remixId,
        activeTab,
        entityKey,
        variantKey,
        flatIndex,
      );

      // Clamp activeSheetRef inside the variant scope when the removed sheet
      // was at/after the active local index.
      if (
        activeSheetRef.entityKey === entityKey &&
        activeSheetRef.variantKey === variantKey &&
        activeSheetRef.sheetIndex >= sheetIndex
      ) {
        const nextLocal = Math.max(0, activeSheetRef.sheetIndex - 1);
        log.debug('handleRemoveSheet', 'clamp active sheet ref', {
          from: activeSheetRef.sheetIndex,
          to: nextLocal,
        });
        setActiveSheetRef({ entityKey, variantKey, sheetIndex: nextLocal });
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

  // Resolve modal entity for the variants overlay. Defensive: when set, the
  // sidebar guarantees char/prop only — but guard mix and missing keys to be
  // belt-and-suspenders (auto-close on next render via setState in effect-less
  // path: we only render the modal when guards pass).
  const modalEntity =
    variantsModalFor !== null
      ? tabEntities.find((e) => e.key === variantsModalFor) ?? null
      : null;
  const showVariantsModal =
    variantsModalFor !== null &&
    modalEntity !== null &&
    modalEntity.type !== 'mix';
  if (variantsModalFor !== null && !showVariantsModal) {
    // Cannot render the modal — entity missing or somehow mix. Log + render
    // nothing for the overlay; user can close the parent modal and reopen.
    log.warn('render', 'variantsModalFor invalid — overlay suppressed', {
      variantsModalFor,
      hasEntity: modalEntity !== null,
      entityType: modalEntity?.type,
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={dialogContentRef}
        aria-labelledby="swap-crop-sheet-modal-title"
        // Suppress Radix auto-dismiss — ILS owns Esc + click-outside routing.
        // Without these, Radix would close us when the user dismisses the
        // child variants modal (click on the variants-modal-overlay reaches
        // Radix as "interact outside" of THIS DialogContent).
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={
          {
            ...SWAP_MODAL_TOKENS,
            zIndex: Z_INDEX.swapModal,
          } as React.CSSProperties
        }
        // Full-screen override + dark tokens — neutralises the centered max-w-lg
        // dialog and hides the built-in close button ([&>button]:hidden), since
        // the header already owns the close control.
        className="inset-0 left-0 top-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-[var(--swap-modal-bg)] p-0 text-[var(--swap-modal-text-primary)] [&>button]:hidden"
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
              variantKey: activeVariant?.variantKey ?? null,
              sheetIndex: safeSheetLocalIdx,
            }}
            anySwapRunning={swapBusy}
            submittingKey={submittingKey}
            onSelectVariant={handleSelectVariant}
            onSelectSheet={handleSelectSheet}
            onAddSheet={handleAddSheet}
            onRemoveSheet={handleRemoveSheet}
            onSwapEntity={handleSwapEntity}
            onOpenVariants={handleOpenVariants}
          />

          <CropSheetStage
            sheet={activeSheet}
            selectedSwap={selectedSwap}
            compareMode={compareMode}
            zoomLevel={zoomLevel}
            dividerPosition={dividerPosition}
            swapTask={swapTask}
            isSubmitting={submittingKey !== null && submittingKey === activeEntity?.key}
            onToggleCompare={() => setCompareMode((prev) => !prev)}
            onZoomChange={setZoomLevel}
            onDividerChange={setDividerPosition}
          />

          <SwapParametersSidebar params={params} onChange={setParams} />
        </div>

        {showVariantsModal && modalEntity && (
          <VariantsVisualModal
            key={modalEntity.key}
            remixId={target.remixId}
            entity={modalEntity}
            onClose={() => setVariantsModalFor(null)}
            // Yielded Parent linkage — when ILS cascade-pops the modal slot
            // (e.g. spread change), close ourselves too, not just the child.
            yieldedFrom={{
              parentId: 'swap-crop-sheet-modal',
              onParentForcePop: onClose,
            }}
          />
        )}

        <RelayoutConfirmDialog
          open={pendingAction !== null}
          variantName={pendingAction?.variantName}
          onConfirm={handleConfirmRelayout}
          onCancel={handleCancelRelayout}
        />
      </DialogContent>
    </Dialog>
  );
}
