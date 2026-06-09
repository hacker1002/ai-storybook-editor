// swap-crop-sheet-modal.tsx — Full-screen workspace for the remix swap modal
// (design 05-swap-crop-sheet-modal.md, batch-model).
//
// Thin CONTAINER that owns only SHARED state + selectors + action wiring, then
// renders the active tab:
//   • Header   — RemixModalHeader (3-tab pill group: Variants / Batches / Lotties)
//   • Body     — one of VariantsTab | BatchesTab | LottiesTab (tab owns its own
//                sidebar + CropSheetStage) + SwapParametersSidebar (right)
//
// Both the Variants (sprite plane) and Batches (mix plane) tabs drive a BATCH
// background swap job:
//   • Variants → `sprites[]` + sprite-swap (api/jobs/02). Per-variant synchronous
//     Generate is GONE (sprite-swap redesign).
//   • Batches  → `mixes[]` + mix-swap (api/jobs/05).
//
// On mount the root fires the idempotent legacy→batch migration AND lazily seeds
// the initial sprite; an effect closes the modal when the remix disappears.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRemixById,
  useRemixSprites,
  useRemixBatches,
  useAnyMixSwapRunning,
  useAnySpriteSwapRunning,
  useRemixActions,
  useRemixStore,
} from '@/stores/remix-store';
import { useInteractionLayer } from '@/features/editor/contexts';
import { EnqueueJobError } from '@/apis/jobs-api';
import { createLogger } from '@/utils/logger';
import type {
  SwapCropSheetTarget,
  RemixBatch,
  RemixSprite,
  SwapModelParams,
} from '@/types/remix';
import { RemixModalHeader, type RemixModalTab } from './remix-modal-header';
import { SwapParametersSidebar } from './swap-parameters-sidebar';
import { VariantsTab } from './tabs/variants-tab';
import { BatchesTab } from './tabs/batches-tab';
import { LottiesTab } from './tabs/lotties-tab';
import { SelectionProvider } from './hooks/use-selected-swap-crops';
import { DEFAULT_SWAP_PARAMS, SWAP_MODAL_TOKENS, Z_INDEX, ZOOM } from './swap-modal-constants';

const log = createLogger('Editor', 'SwapCropSheetModal');

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

/** Active sprite+sheet pointer for the Variants tab. */
interface ActiveSpriteRef {
  spriteId: string;
  sheetIndex: number;
}

/** Active batch+sheet pointer for the Batches tab. */
interface ActiveBatchRef {
  batchId: string;
  sheetIndex: number;
}

/** Default tab from the opener target — a `mix` (= batch) opener lands on the
 *  Batches tab, a character/prop opener on Variants. */
function defaultTab(target: SwapCropSheetTarget): RemixModalTab {
  return target.type === 'mix' ? 'batches' : 'variants';
}

/** First active-sprite pointer — first sprite, sheet 0. Null pre-seed. */
function initialSpriteRef(sprites: RemixSprite[]): ActiveSpriteRef | null {
  if (sprites.length === 0) return null;
  return { spriteId: sprites[0].id, sheetIndex: 0 };
}

/** First active-batch pointer — first batch, sheet 0. Null pre-migration. */
function initialBatchRef(batches: RemixBatch[]): ActiveBatchRef | null {
  if (batches.length === 0) return null;
  return { batchId: batches[0].id, sheetIndex: 0 };
}

/** Sprite to re-select after deleting `removedId`. Returns null when no move is
 *  needed (the removed sprite wasn't active, or it doesn't exist). Prefers the
 *  previous sibling; falls back to the next when removing the first sprite.
 *  Caller must pass the pre-removal `sprites` array. */
function spriteRefAfterRemoval(
  sprites: RemixSprite[],
  activeRef: ActiveSpriteRef | null,
  removedId: string,
): ActiveSpriteRef | null {
  if (!activeRef || activeRef.spriteId !== removedId) return null;
  const idx = sprites.findIndex((s) => s.id === removedId);
  if (idx === -1) return null;
  const sibling = sprites[idx - 1] ?? sprites[idx + 1] ?? null;
  return sibling ? { spriteId: sibling.id, sheetIndex: 0 } : null;
}

/** Batch to re-select after deleting `removedId`. Mirror of
 *  {@link spriteRefAfterRemoval} on the batch plane. */
function batchRefAfterRemoval(
  batches: RemixBatch[],
  activeRef: ActiveBatchRef | null,
  removedId: string,
): ActiveBatchRef | null {
  if (!activeRef || activeRef.batchId !== removedId) return null;
  const idx = batches.findIndex((b) => b.id === removedId);
  if (idx === -1) return null;
  const sibling = batches[idx - 1] ?? batches[idx + 1] ?? null;
  return sibling ? { batchId: sibling.id, sheetIndex: 0 } : null;
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

/** Maps a sprite-swap enqueue error code (api/jobs/02) to a toast message. */
function mapSpriteSwapError(code: string | undefined): string {
  switch (code) {
    case 'MISSING_OBJECT_CONFIG':
      return 'Finish the swap config (human + visual + extract + ≥1 trait) for every character first';
    case 'NO_SWAP_OBJECTS':
      return 'This sprite has no variants to swap';
    case 'SPRITE_NOT_FOUND':
      return 'This sprite no longer exists — reopen the modal';
    default:
      return "Couldn't start swap — try again";
  }
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  const remix = useRemixById(target.remixId);
  const sprites = useRemixSprites(target.remixId);
  const batches = useRemixBatches(target.remixId);
  const anyMixSwapRunning = useAnyMixSwapRunning(target.remixId);
  const anySpriteSwapRunning = useAnySpriteSwapRunning(target.remixId);
  const {
    removeBatch,
    appendBatchSheet,
    removeBatchSheet,
    startMixSwap,
    startSpriteSwap,
    removeSprite,
    appendSpriteSheet,
    removeSpriteSheet,
    ensureRemixSpriteSeed,
  } = useRemixActions();
  // `migrateLegacyRemixToBatch` lives on the sync slice — pull it directly.
  const migrateLegacyRemixToBatch = useRemixStore(
    (s) => s.migrateLegacyRemixToBatch,
  );

  // ── Shared modal state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<RemixModalTab>(() =>
    defaultTab(target),
  );
  const [activeSpriteRef, setActiveSpriteRef] = useState<ActiveSpriteRef | null>(
    () => initialSpriteRef(sprites),
  );
  const [submittingSpriteId, setSubmittingSpriteId] = useState<string | null>(
    null,
  );
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
    portalSelectors: [
      '[data-radix-popper-content-wrapper]',
      '[data-radix-select-content]',
      '[role="listbox"]',
    ],
  });

  // ── On-mount one-shots (idempotent) ──────────────────────────────────────────
  // Legacy→batch migration + lazy sprite seed. Deps `[target.remixId]` only
  // (React 19 lint — memory feedback_react19_set_state_in_effect). Both actions
  // are no-ops when nothing is needed and persist immediately.
  useEffect(() => {
    void migrateLegacyRemixToBatch(target.remixId);
    void ensureRemixSpriteSeed(target.remixId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.remixId]);

  // ── Auto-close when the remix disappears (realtime delete) ───────────────────
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
    if (tab === 'variants' && !activeSpriteRef) {
      setActiveSpriteRef(initialSpriteRef(sprites));
    } else if (tab === 'batches' && !activeBatchRef) {
      setActiveBatchRef(initialBatchRef(batches));
    }
  };

  const handleSelectSpriteSheet = useCallback(
    (spriteId: string, sheetIndex: number) => {
      log.debug('handleSelectSpriteSheet', 'select sheet', { spriteId, sheetIndex });
      setActiveSpriteRef({ spriteId, sheetIndex });
      setCompareMode(false);
      setDividerPosition(50);
    },
    [],
  );

  const handleSelectBatchSheet = useCallback(
    (batchId: string, sheetIndex: number) => {
      log.debug('handleSelectBatchSheet', 'select sheet', { batchId, sheetIndex });
      setActiveBatchRef({ batchId, sheetIndex });
      setCompareMode(false);
      setDividerPosition(50);
    },
    [],
  );

  const handleToggleCompare = useCallback(
    () => setCompareMode((prev) => !prev),
    [],
  );
  const handleZoomChange = useCallback((z: number) => setZoomLevel(z), []);
  const handleDividerChange = useCallback(
    (p: number) => setDividerPosition(p),
    [],
  );

  // ── onSwapSprite (Variants tab) ──────────────────────────────────────────────
  const handleSwapSprite = useCallback(
    async (spriteId: string) => {
      setSubmittingSpriteId(spriteId);
      try {
        const outcome = await startSpriteSwap({
          remixId: target.remixId,
          spriteId,
          params,
          forceResweep: true,
        });
        log.info('handleSwapSprite', 'enqueue outcome', {
          spriteId,
          kind: outcome.kind,
        });
        if (outcome.kind === 'deduped') {
          toast.info('A sprite swap is already running for this remix');
        } else if (outcome.kind === 'enqueued') {
          toast.success('Swap started');
        }
        // 'skipped' (busy) is silent — gating already disables the button.
      } catch (err) {
        const code = err instanceof EnqueueJobError ? err.code : undefined;
        log.error('handleSwapSprite', 'enqueue failed', { spriteId, code });
        toast.error(mapSpriteSwapError(code));
      } finally {
        setSubmittingSpriteId(null);
      }
    },
    [startSpriteSwap, target.remixId, params],
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

  // ── Sprite sidebar action callbacks (thin store delegates) ───────────────────
  // `handleAddSprite` lives in `VariantsTab` (reads selection from
  // `useSelectedSwapCrops()`); the modal owns only `onActivateSprite`.
  const handleRemoveSprite = useCallback(
    (spriteId: string) => {
      // Capture the reselection target against the pre-removal list, then move
      // selection to the previous sibling once the delete actually lands.
      const nextRef = spriteRefAfterRemoval(sprites, activeSpriteRef, spriteId);
      void removeSprite(target.remixId, spriteId)
        .then((ok) => {
          if (ok && nextRef) {
            handleSelectSpriteSheet(nextRef.spriteId, nextRef.sheetIndex);
          }
        })
        .catch((err) => {
          log.warn('handleRemoveSprite', 'removeSprite rejected', {
            spriteId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [removeSprite, target.remixId, sprites, activeSpriteRef, handleSelectSpriteSheet],
  );
  const handleAddSpriteSheet = useCallback(
    (spriteId: string) => void appendSpriteSheet(target.remixId, spriteId),
    [appendSpriteSheet, target.remixId],
  );
  const handleRemoveSpriteSheet = useCallback(
    (spriteId: string, sheetIndex: number) =>
      void removeSpriteSheet(target.remixId, spriteId, sheetIndex),
    [removeSpriteSheet, target.remixId],
  );

  // ── Batch sidebar action callbacks (thin store delegates) ────────────────────
  const handleRemoveBatch = useCallback(
    (batchId: string) => {
      const nextRef = batchRefAfterRemoval(batches, activeBatchRef, batchId);
      void removeBatch(target.remixId, batchId)
        .then((ok) => {
          if (ok && nextRef) {
            handleSelectBatchSheet(nextRef.batchId, nextRef.sheetIndex);
          }
        })
        .catch((err) => {
          log.warn('handleRemoveBatch', 'removeBatch rejected', {
            batchId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [removeBatch, target.remixId, batches, activeBatchRef, handleSelectBatchSheet],
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

  // ── Selection reset keys ─────────────────────────────────────────────────────
  // `SelectionProvider` is remounted (→ fresh `new Set()`) by changing its `key`
  // — NOT useEffect+setState (React 19 lint). The reset key is the active sprite/
  // batch id + the SUM of swap_results across its sheets (a completed swap pushes
  // results → sum increases → key changes → selection resets; switching SHEETS
  // within the same sprite/batch keeps the sum stable → selection persists).
  const activeSprite = useMemo(
    () =>
      activeSpriteRef
        ? sprites.find((s) => s.id === activeSpriteRef.spriteId) ?? null
        : null,
    [sprites, activeSpriteRef],
  );
  const activeSpriteSwapResultsCount = useMemo(
    () =>
      activeSprite
        ? activeSprite.crop_sheets.reduce(
            (acc, s) => acc + s.swap_results.length,
            0,
          )
        : 0,
    [activeSprite],
  );
  const spriteSelectionResetKey = `${activeSpriteRef?.spriteId ?? '__none__'}::${activeSpriteSwapResultsCount}`;

  const activeBatch = useMemo(
    () =>
      activeBatchRef
        ? batches.find((b) => b.id === activeBatchRef.batchId) ?? null
        : null,
    [batches, activeBatchRef],
  );
  const activeBatchTotalSwapResultsCount = useMemo(
    () =>
      activeBatch
        ? activeBatch.crop_sheets.reduce(
            (acc, s) => acc + s.swap_results.length,
            0,
          )
        : 0,
    [activeBatch],
  );
  const batchSelectionResetKey = `${activeBatchRef?.batchId ?? '__none__'}::${activeBatchTotalSwapResultsCount}`;

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
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={
          {
            ...SWAP_MODAL_TOKENS,
            zIndex: Z_INDEX.swapModal,
          } as React.CSSProperties
        }
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
            // Keyed remount → per-cell selection inside `SelectionProvider`
            // resets on sprite switch / new swap_results (no useEffect+setState).
            <SelectionProvider key={spriteSelectionResetKey}>
              <VariantsTab
                remixId={target.remixId}
                sprites={sprites}
                activeSpriteRef={activeSpriteRef}
                submittingSpriteId={submittingSpriteId}
                anySpriteSwapRunning={anySpriteSwapRunning}
                onSelectSpriteSheet={handleSelectSpriteSheet}
                onActivateSprite={setActiveSpriteRef}
                onRemoveSprite={handleRemoveSprite}
                onAddSheet={handleAddSpriteSheet}
                onRemoveSheet={handleRemoveSpriteSheet}
                onSwapSprite={handleSwapSprite}
                {...sharedStageProps}
              />
            </SelectionProvider>
          )}

          {activeTab === 'batches' && (
            <SelectionProvider key={batchSelectionResetKey}>
              <BatchesTab
                remixId={target.remixId}
                batches={batches}
                activeBatchRef={activeBatchRef}
                submittingBatchId={submittingBatchId}
                anyMixSwapRunning={anyMixSwapRunning}
                onSelectBatchSheet={handleSelectBatchSheet}
                onActivateBatch={setActiveBatchRef}
                onRemoveBatch={handleRemoveBatch}
                onAddSheet={handleAddSheet}
                onRemoveSheet={handleRemoveSheet}
                onSwapBatch={handleSwapBatch}
                {...sharedStageProps}
              />
            </SelectionProvider>
          )}

          {activeTab === 'lotties' && <LottiesTab remixId={target.remixId} />}

          <SwapParametersSidebar
            params={params}
            onChange={setParams}
            activeTab={activeTab}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
