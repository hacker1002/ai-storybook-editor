// swap-crop-sheet-modal.tsx — Full-screen workspace for the remix swap modal
// (design 05-swap-crop-sheet-modal.md, batch-model rev2).
//
// Phase 06 root rewrite — the root is now a thin CONTAINER that owns only
// SHARED state + selectors + action wiring, then renders the active tab:
//   • Header   — RemixModalHeader (3-tab pill group: Variants / Batches / Lotties)
//   • Body     — one of VariantsTab | BatchesTab | LottiesTab (tab owns its own
//                sidebar + CropSheetStage; the stage is NOT rendered by the root)
//                + SwapParametersSidebar (right — collect-only swap params)
//
// Shared state held here (lives across tab/variant/batch switches):
//   activeTab, activeVariantRef, variantSwapTasks, activeBatchRef, compareMode,
//   zoomLevel, dividerPosition, params, submittingBatchId.
//
// Built on shadcn `Dialog` overridden to full-screen (inset-0, max-w-none,
// h-screen) — free focus-trap + Esc dismissal. Dark theme tokens applied via
// inline CSS variables on DialogContent.
//
// On mount the root fires the idempotent legacy→batch migration once, and an
// effect closes the modal when the underlying remix disappears (realtime).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRemixById,
  useRemixVariants,
  useRemixBatches,
  useAnyMixSwapRunning,
  useRemixActions,
  useRemixStore,
} from '@/stores/remix-store';
import type { RemixConfigCharacterView } from '@/stores/remix-store/selectors';
import { useHumansStore } from '@/stores/humans-store';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useInteractionLayer } from '@/features/editor/contexts';
import { EnqueueJobError } from '@/apis/jobs-api';
import { createLogger } from '@/utils/logger';
import type { Human } from '@/types/human';
import type {
  SwapCropSheetTarget,
  RemixVariantEntity,
  RemixBatch,
  SwapModelParams,
  SwapPreviewState,
} from '@/types/remix';
import { RemixModalHeader, type RemixModalTab } from './remix-modal-header';
import { SwapParametersSidebar } from './swap-parameters-sidebar';
import { VariantsTab } from './tabs/variants-tab';
import { BatchesTab } from './tabs/batches-tab';
import { LottiesTab } from './tabs/lotties-tab';
import { runVariantSwap } from '../utils/run-variant-swap';
import { DEFAULT_SWAP_PARAMS, SWAP_MODAL_TOKENS, Z_INDEX, ZOOM } from './swap-modal-constants';

const log = createLogger('Editor', 'SwapCropSheetModal');

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

/** Active variant pointer for the Variants tab. Null when the remix has no
 *  char/prop entities yet. `${entityKey}/${variantKey}` is also the
 *  `variantSwapTasks` map key. */
interface ActiveVariantRef {
  entityKey: string;
  variantKey: string;
}

/** Active batch+sheet pointer for the Batches tab. */
interface ActiveBatchRef {
  batchId: string;
  sheetIndex: number;
}

/** Default tab from the opener target — a `mix` (= batch) opener lands on the
 *  Batches tab, everything else on Variants. */
function defaultTab(target: SwapCropSheetTarget): RemixModalTab {
  return target.type === 'mix' ? 'batches' : 'variants';
}

/** First active-variant pointer when the modal opens. Anchors to the opener's
 *  entity (if it is a char/prop) + its first variant (base first by selector
 *  ordering); else the first entity/variant; null when no char/prop entities. */
function initialVariantRef(
  target: SwapCropSheetTarget,
  entities: RemixVariantEntity[],
): ActiveVariantRef | null {
  if (entities.length === 0) return null;
  const opener =
    target.type !== 'mix'
      ? entities.find((e) => e.key === target.key)
      : undefined;
  const entity = opener ?? entities[0];
  const firstVariant = entity.variants[0];
  if (!firstVariant) return null;
  return { entityKey: entity.key, variantKey: firstVariant.variantKey };
}

/** First active-batch pointer when the modal opens — first batch, sheet 0.
 *  Null when the remix has no batches yet (pre-migration frame). */
function initialBatchRef(batches: RemixBatch[]): ActiveBatchRef | null {
  if (batches.length === 0) return null;
  return { batchId: batches[0].id, sheetIndex: 0 };
}

/** Maps a mix-swap enqueue error code to a user-facing toast message. */
function mapMixSwapError(code: string | undefined): string {
  switch (code) {
    case 'MISSING_VARIANT_REFERENCE':
      return 'Generate a swapped visual for every character first — open the Variants tab';
    case 'TOO_MANY_SWAP_TARGETS':
      return 'This batch has too many swap targets — split it into more batches';
    case 'NO_SWAP_TARGETS':
      return 'This batch has no characters to swap';
    default:
      return "Couldn't start swap — try again";
  }
}

/** Resolves the frozen `remix_config` character view for `charKey` from the
 *  store + humans cache without a hook — mirrors `useRemixConfigCharacter`
 *  so the Generate handler can run inside an event callback. Returns null for
 *  props / missing config. */
function resolveConfigCharacter(
  remixId: string,
  charKey: string,
): RemixConfigCharacterView | null {
  const configChar =
    useRemixStore
      .getState()
      .remixes.find((r) => r.id === remixId)
      ?.remix_config.characters.find((c) => c.key === charKey) ?? null;
  if (!configChar) return null;

  let convertedImage: string | null = null;
  if (configChar.human_id && configChar.visual) {
    const human = useHumansStore
      .getState()
      .humans.find((h) => h.id === configChar.human_id);
    convertedImage =
      human?.visualProfiles.find((vp) => vp.name === configChar.visual)
        ?.convertedImage ?? null;
  }
  return {
    human_id: configChar.human_id,
    visual: configChar.visual,
    traits: configChar.traits,
    converted_image: convertedImage,
  };
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  const remix = useRemixById(target.remixId);
  const variants = useRemixVariants(target.remixId);
  const batches = useRemixBatches(target.remixId);
  const anyMixSwapRunning = useAnyMixSwapRunning(target.remixId);
  const {
    setVariantVisualSwapUrl,
    addBatch,
    removeBatch,
    appendBatchSheet,
    removeBatchSheet,
    startMixSwap,
  } = useRemixActions();
  // `migrateLegacyRemixToBatch` lives on the sync slice (not in the
  // `useRemixActions` bundle) — pull it directly.
  const migrateLegacyRemixToBatch = useRemixStore(
    (s) => s.migrateLegacyRemixToBatch,
  );

  // ── Shared modal state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<RemixModalTab>(() =>
    defaultTab(target),
  );
  const [activeVariantRef, setActiveVariantRef] =
    useState<ActiveVariantRef | null>(() => initialVariantRef(target, variants));
  const [variantSwapTasks, setVariantSwapTasks] = useState<
    Record<string, SwapPreviewState>
  >({});
  const [activeBatchRef, setActiveBatchRef] = useState<ActiveBatchRef | null>(
    () => initialBatchRef(batches),
  );
  const [compareMode, setCompareMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM.default);
  const [dividerPosition, setDividerPosition] = useState(50);
  const [params, setParams] = useState<SwapModelParams>(DEFAULT_SWAP_PARAMS);
  const [submittingBatchId, setSubmittingBatchId] = useState<string | null>(
    null,
  );

  // ── Focus restore + ILS slot ────────────────────────────────────────────────
  const triggerElRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    triggerElRef.current = document.activeElement as HTMLElement | null;
    return () => triggerElRef.current?.focus();
  }, []);

  const dialogContentRef = useRef<HTMLDivElement>(null);

  const handleEscOrClickOutside = useCallback(() => {
    log.debug('handleEscOrClickOutside', 'esc/click-outside closes modal', {});
    onClose();
  }, [onClose]);

  useInteractionLayer('modal', {
    id: 'swap-crop-sheet-modal',
    ref: dialogContentRef,
    hotkeys: ['Escape'],
    onHotkey: (key) => {
      if (key === 'Escape') handleEscOrClickOutside();
    },
    onClickOutside: handleEscOrClickOutside,
    captureClickOutside: true,
    // Radix Select / Popper / Tooltip portals targeted inside this modal — treat
    // clicks inside them as "click inside this layer".
    portalSelectors: [
      '[data-radix-popper-content-wrapper]',
      '[data-radix-select-content]',
      '[role="listbox"]',
    ],
  });

  // ── Migration on-mount (idempotent) ─────────────────────────────────────────
  // Fire the legacy→batch migration exactly once. Deps `[target.remixId]` only
  // (React 19 lint — memory feedback_react19_set_state_in_effect). The action is
  // a no-op for already-migrated remixes and persists immediately.
  useEffect(() => {
    void migrateLegacyRemixToBatch(target.remixId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.remixId]);

  // ── Auto-close when the remix disappears (realtime delete) ───────────────────
  // `useRemixById` returns null only when the remix is gone (selectors return []
  // for empty variants/batches — so a null remix is the unambiguous "deleted"
  // signal). Closing via the onClose callback prop is the only side-effect (not
  // an arbitrary in-effect setState).
  useEffect(() => {
    if (remix === null) {
      log.warn('autoClose', 'remix resolved null — closing modal', {
        remixId: target.remixId,
      });
      toast.info('Remix đã bị xoá');
      onClose();
    }
  }, [remix, onClose, target.remixId]);

  // ── Tab change + shared stage mutators ───────────────────────────────────────
  const handleTabChange = (tab: RemixModalTab) => {
    log.debug('handleTabChange', 'switch tab', { from: activeTab, to: tab });
    setActiveTab(tab);
    setCompareMode(false);
    setDividerPosition(50);
    if (tab === 'variants' && !activeVariantRef) {
      setActiveVariantRef(initialVariantRef(target, variants));
    } else if (tab === 'batches' && !activeBatchRef) {
      setActiveBatchRef(initialBatchRef(batches));
    }
  };

  const handleSelectVariant = (entityKey: string, variantKey: string) => {
    log.debug('handleSelectVariant', 'select variant', { entityKey, variantKey });
    setActiveVariantRef({ entityKey, variantKey });
    setCompareMode(false);
    setDividerPosition(50);
  };

  const handleSelectBatchSheet = (batchId: string, sheetIndex: number) => {
    log.debug('handleSelectBatchSheet', 'select sheet', { batchId, sheetIndex });
    setActiveBatchRef({ batchId, sheetIndex });
    setCompareMode(false);
    setDividerPosition(50);
  };

  const handleToggleCompare = useCallback(
    () => setCompareMode((prev) => !prev),
    [],
  );
  const handleZoomChange = useCallback((z: number) => setZoomLevel(z), []);
  const handleDividerChange = useCallback(
    (p: number) => setDividerPosition(p),
    [],
  );

  // ── onRunGenerate (Variants tab) ─────────────────────────────────────────────
  // Orchestrates a single per-variant re-swap via `run-variant-swap.ts`. The
  // helper's `setTask` keys by the value passed as its first arg; the modal map
  // is keyed `${entityKey}/${variantKey}`, so we pass the composite key as the
  // task identity while the persist target still uses the bare `variantKey`.
  const handleRunGenerate = useCallback(
    (entityKey: string, variantKey: string) => {
      const entity = variants.find((e) => e.key === entityKey);
      const variant = entity?.variants.find((v) => v.variantKey === variantKey);
      if (!entity || !variant) {
        log.warn('handleRunGenerate', 'entity/variant not found — skip', {
          entityKey,
          variantKey,
        });
        return;
      }

      const cfgChar = resolveConfigCharacter(target.remixId, entityKey);
      const baseSwapUrl =
        entity.variants.find((v) => v.isBase)?.visualSwapUrl ?? null;
      const humanImageUrlOverride = variant.isBase ? null : baseSwapUrl;

      const humansMap: Record<string, Human> = Object.fromEntries(
        useHumansStore.getState().humans.map((h) => [h.id, h]),
      );
      const snapChars = useSnapshotStore.getState().characters ?? [];

      const taskKey = `${entityKey}/${variantKey}`;
      const setTask = (_key: string, state: SwapPreviewState) =>
        setVariantSwapTasks((prev) => ({ ...prev, [taskKey]: state }));

      log.info('handleRunGenerate', 'start variant swap', {
        entityKey,
        variantKey,
        isBase: variant.isBase,
        reuseBaseSwap: humanImageUrlOverride != null,
      });

      void runVariantSwap(
        variantKey,
        cfgChar,
        variant.illustrationUrl,
        humanImageUrlOverride,
        humansMap,
        snapChars,
        entityKey,
        setTask,
        (img) => setVariantVisualSwapUrl(target.remixId, entityKey, variantKey, img),
      );
    },
    [variants, target.remixId, setVariantVisualSwapUrl],
  );

  // ── onSwapBatch (Batches tab) ────────────────────────────────────────────────
  const handleSwapBatch = useCallback(
    async (batchId: string) => {
      setSubmittingBatchId(batchId);
      try {
        const outcome = await startMixSwap({
          remixId: target.remixId,
          batchId,
          params,
          forceResweep: true,
        });
        log.info('handleSwapBatch', 'enqueue outcome', {
          batchId,
          kind: outcome.kind,
        });
        if (outcome.kind === 'deduped') {
          toast.info('A swap is already running for this remix');
        } else if (outcome.kind === 'enqueued') {
          toast.success('Swap started');
        }
        // 'skipped' (busy) is silent — gating already disables the button.
      } catch (err) {
        const code = err instanceof EnqueueJobError ? err.code : undefined;
        log.error('handleSwapBatch', 'enqueue failed', { batchId, code });
        toast.error(mapMixSwapError(code));
      } finally {
        setSubmittingBatchId(null);
      }
    },
    [startMixSwap, target.remixId, params],
  );

  // ── Batch sidebar action callbacks (thin store delegates) ────────────────────
  const handleAddBatch = useCallback(
    () => void addBatch(target.remixId),
    [addBatch, target.remixId],
  );
  const handleRemoveBatch = useCallback(
    (batchId: string) => void removeBatch(target.remixId, batchId),
    [removeBatch, target.remixId],
  );
  const handleAddSheet = useCallback(
    (batchId: string) => void appendBatchSheet(target.remixId, batchId),
    [appendBatchSheet, target.remixId],
  );
  const handleRemoveSheet = useCallback(
    (batchId: string, sheetIndex: number) =>
      void removeBatchSheet(target.remixId, batchId, sheetIndex),
    [removeBatchSheet, target.remixId],
  );

  // entity selectors return [] when the remix is gone; the null-remix close is
  // handled by the effect above. Render null for that single frame.
  if (remix === null) return null;

  const sharedStageProps = {
    compareMode,
    zoomLevel,
    dividerPosition,
    onToggleCompare: handleToggleCompare,
    onZoomChange: handleZoomChange,
    onDividerChange: handleDividerChange,
  };

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
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={
          {
            ...SWAP_MODAL_TOKENS,
            zIndex: Z_INDEX.swapModal,
          } as React.CSSProperties
        }
        // Full-screen override + dark tokens; hide the built-in close button —
        // the header owns the close control.
        className="inset-0 left-0 top-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-[var(--swap-modal-bg)] p-0 text-[var(--swap-modal-text-primary)] [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Remix — quản lý crop sheet</DialogTitle>
        <DialogDescription className="sr-only">
          Xem và quản lý variants, batches và lotties của remix.
        </DialogDescription>

        <RemixModalHeader
          title={remix?.name || 'Remix'}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onClose={onClose}
        />

        <div className="flex min-h-0 flex-1">
          {activeTab === 'variants' && (
            <VariantsTab
              remixId={target.remixId}
              entities={variants}
              activeVariantRef={activeVariantRef}
              variantSwapTasks={variantSwapTasks}
              onSelectVariant={handleSelectVariant}
              onRunGenerate={handleRunGenerate}
              {...sharedStageProps}
            />
          )}

          {activeTab === 'batches' && (
            <BatchesTab
              remixId={target.remixId}
              batches={batches}
              activeBatchRef={activeBatchRef}
              submittingBatchId={submittingBatchId}
              anyMixSwapRunning={anyMixSwapRunning}
              onSelectBatchSheet={handleSelectBatchSheet}
              onAddBatch={handleAddBatch}
              onRemoveBatch={handleRemoveBatch}
              onAddSheet={handleAddSheet}
              onRemoveSheet={handleRemoveSheet}
              onSwapBatch={handleSwapBatch}
              {...sharedStageProps}
            />
          )}

          {activeTab === 'lotties' && <LottiesTab remixId={target.remixId} />}

          <SwapParametersSidebar params={params} onChange={setParams} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
