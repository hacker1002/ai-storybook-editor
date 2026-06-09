// variants-tab.tsx — Variants tab of the swap modal (sprite-swap batch model).
//
// REWRITTEN (sprite-swap redesign): the per-variant synchronous Generate UI is
// gone. The Variants tab now mirrors the Batches tab on the `sprites[]` plane —
// a Sprite→Sheet sidebar (SpritesSidebar) + center CropSheetStage
// (mode='batches', reused) driving a BATCH sprite-swap background job (api/jobs/02).
//
// Presentational: all persisted data flows in via props (the modal owns the
// shared state + startSpriteSwap / add / remove sprite+sheet wiring). This tab:
//   - derives the active sprite / sheet / selected swap result,
//   - resolves the swap precondition (every lineup CHARACTER must have a COMPLETE
//     swap config) via `sprite-swap-gating.ts` + the humans cache,
//   - gates the Swap button + supplies the gating tooltip,
//   - guards DESTRUCTIVE actions (add/remove sheet, remove sprite) behind a
//     confirm dialog when the sprite has ≥1 swap_result,
//   - wires per-cell selection (subset Add Sprite) + cross-sprite ownership
//     (★ / take-back) through the generalized Stage (`cropKeyOf`).
//
// SECURITY: never log media_url / swap URLs / human config.

import { useCallback, useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';
import { useRemixById, useRemixActions } from '@/stores/remix-store';
import { useHumans } from '@/stores/humans-store';
import type { RemixSprite } from '@/types/remix';
import {
  buildSwapConfigViews,
  missingSwapConfigObjects,
} from './sprite-swap-gating';
import { CropSheetStage } from '../crop-sheet-stage';
import type { RenderableCrop } from '../crop-sheet-stage/composed-crop-sheet';
import {
  RelayoutConfirmDialog,
  type RelayoutConfirmKind,
} from '../relayout-confirm-dialog';
import { useCollapseState } from '../sidebar/use-collapse-state';
import { useSelectedSwapCrops } from '../hooks/use-selected-swap-crops';
import { useSpriteOwnership } from '../hooks/use-sprite-ownership';
import { SpritesSidebar } from './sprites-sidebar';

const log = createLogger('Editor', 'VariantsTab');

export interface VariantsTabProps {
  remixId: string;
  sprites: RemixSprite[];
  activeSpriteRef: { spriteId: string; sheetIndex: number } | null;
  submittingSpriteId: string | null;
  anySpriteSwapRunning: boolean;
  onSelectSpriteSheet: (spriteId: string, sheetIndex: number) => void;
  /** Set the modal-owned activeSpriteRef after a successful subset Add Sprite so
   *  the new sprite (sheet 0) is auto-selected. */
  onActivateSprite: (ref: { spriteId: string; sheetIndex: number }) => void;
  onRemoveSprite: (spriteId: string) => void;
  onAddSheet: (spriteId: string) => void;
  onRemoveSheet: (spriteId: string, sheetIndex: number) => void;
  onSwapSprite: (spriteId: string) => void;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  onToggleCompare: () => void;
  onZoomChange: (z: number) => void;
  onDividerChange: (p: number) => void;
}

interface PendingAction {
  kind: RelayoutConfirmKind;
  spriteName: string;
  run: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function spriteHasSwapResults(sprite: RemixSprite): boolean {
  return sprite.crop_sheets.some((s) => s.swap_results.length > 0);
}

/** cropKey accessor for the sprite plane — `${type}/${object_key}/${variant_key}`. */
const spriteCropKeyOf = (crop: RenderableCrop): string =>
  `${crop.type ?? ''}/${crop.object_key ?? ''}/${crop.variant_key ?? ''}`;

export function VariantsTab({
  remixId,
  sprites,
  activeSpriteRef,
  submittingSpriteId,
  anySpriteSwapRunning,
  onSelectSpriteSheet,
  onActivateSprite,
  onRemoveSprite,
  onAddSheet,
  onRemoveSheet,
  onSwapSprite,
  compareMode,
  zoomLevel,
  dividerPosition,
  onToggleCompare,
  onZoomChange,
  onDividerChange,
}: VariantsTabProps) {
  const { isCollapsed, toggle: toggleCollapse } = useCollapseState();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const {
    keys: selectedSwapCells,
    toggle: toggleSwapCellSelection,
    clear: clearSwapCellSelection,
  } = useSelectedSwapCrops();
  const { addSprite, takeSpriteFinalBack } = useRemixActions();

  // Swap-config gating: resolve every character's config view once (frozen
  // remix_config + live humans cache for converted_image).
  const remix = useRemixById(remixId);
  const humans = useHumans();
  const configViews = useMemo(
    () => (remix ? buildSwapConfigViews(remix, humans) : new Map()),
    [remix, humans],
  );

  // Cross-sprite ownership for the AFTER pane (★ / take-back).
  const currentSpriteId = activeSpriteRef?.spriteId ?? null;
  const { getOwnership } = useSpriteOwnership(remix, currentSpriteId);

  const handleTakeBack = useCallback(
    (cropKey: string) => {
      if (!currentSpriteId) {
        log.warn('handleTakeBack', 'no currentSpriteId — ignore', { cropKey });
        return;
      }
      const parts = cropKey.split('/');
      if (parts.length < 3) return;
      const [type, objectKey, variantKey] = parts as [
        'character' | 'prop',
        string,
        string,
      ];
      const ownership = getOwnership(cropKey);
      if (ownership.state !== 'owned-foreign') {
        log.debug('handleTakeBack', 'not foreign-owned — ignore', {
          cropKey,
          state: ownership.state,
        });
        return;
      }
      log.info('handleTakeBack', 'invoking takeSpriteFinalBack', {
        remixId,
        cropKey,
        targetSpriteId: currentSpriteId,
      });
      takeSpriteFinalBack(remixId, type, objectKey, variantKey, currentSpriteId)
        .then((ok) => {
          if (!ok) toast.error('Could not take the final back.');
        })
        .catch((err) => {
          log.warn('handleTakeBack', 'rejected', {
            error: err instanceof Error ? err.message : String(err),
          });
          toast.error(
            err instanceof Error ? err.message : 'Could not take the final back.',
          );
        });
    },
    [remixId, currentSpriteId, getOwnership, takeSpriteFinalBack],
  );

  // ── Derive active sprite / sheet / sources ─────────────────────────────────
  const sprite = useMemo(
    () =>
      sprites.find((s) => s.id === activeSpriteRef?.spriteId) ??
      sprites[0] ??
      null,
    [sprites, activeSpriteRef],
  );
  const sheetCount = sprite?.crop_sheets.length ?? 0;
  const sheetIndex =
    sprite && sheetCount > 0
      ? clamp(activeSpriteRef?.sheetIndex ?? 0, 0, sheetCount - 1)
      : 0;
  const sheet = sprite?.crop_sheets[sheetIndex] ?? null;
  const selectedSwap = sheet?.swap_results.find((s) => s.is_selected) ?? null;
  const swapTask = sprite?.swapTask ?? { state: 'idle' as const };
  const isSubmitting =
    submittingSpriteId != null && submittingSpriteId === sprite?.id;
  const isRunning = swapTask.state === 'running';

  // ── Precondition + gating ──────────────────────────────────────────────────
  const missingConfigObjects = useMemo(
    () => (sprite ? missingSwapConfigObjects(sprite, configViews) : []),
    [sprite, configViews],
  );
  const lineupCount = useMemo(
    () =>
      sprite
        ? sprite.crop_sheets.reduce((acc, s) => acc + s.crops.length, 0)
        : 0,
    [sprite],
  );

  const hasCells = lineupCount > 0;
  // canSwap = every lineup character has a COMPLETE config (NOT just ≥1) — a
  // partial config slips past enqueue and fails server-side MISSING_OBJECT_CONFIG.
  const canSwap = sprite != null && hasCells && missingConfigObjects.length === 0;
  const swapDisabled =
    !canSwap || anySpriteSwapRunning || isSubmitting || isRunning;

  const gateReason = useMemo<string | undefined>(() => {
    if (!sprite) return 'Select a sprite to swap';
    if (anySpriteSwapRunning && !isSubmitting && !isRunning)
      return 'A sprite swap is already running for this remix';
    if (!hasCells) return 'This sprite has no variants to swap';
    if (missingConfigObjects.length > 0)
      return 'Finish the swap config (human + visual + extract + ≥1 trait) for every character first';
    return undefined;
  }, [sprite, anySpriteSwapRunning, isSubmitting, isRunning, hasCells, missingConfigObjects]);

  log.debug('render', 'variants tab (sprite)', {
    remixId,
    spriteCount: sprites.length,
    activeSpriteId: sprite?.id ?? null,
    sheetIndex,
    sheetCount,
    canSwap,
    missingConfigCount: missingConfigObjects.length,
    isSubmitting,
    isRunning,
  });

  // ── Destructive-action guard (deferred-action pattern) ─────────────────────
  const guardDestructive = (
    target: RemixSprite,
    kind: RelayoutConfirmKind,
    run: () => void,
  ) => {
    if (spriteHasSwapResults(target)) {
      log.info('guardDestructive', 'defer destructive action — confirm', {
        spriteId: target.id,
        kind,
      });
      setPending({ kind, spriteName: target.name, run });
    } else {
      run();
    }
  };

  const findSprite = (spriteId: string) =>
    sprites.find((s) => s.id === spriteId) ?? null;

  const handleAddSheet = (spriteId: string) => {
    const target = findSprite(spriteId);
    if (!target) return;
    guardDestructive(target, 'add-sheet', () => onAddSheet(spriteId));
  };
  const handleRemoveSheet = (spriteId: string, idx: number) => {
    const target = findSprite(spriteId);
    if (!target) return;
    guardDestructive(target, 'remove-sheet', () => onRemoveSheet(spriteId, idx));
  };
  const handleRemoveSprite = (spriteId: string) => {
    const target = findSprite(spriteId);
    if (!target) return;
    guardDestructive(target, 'remove-batch', () => onRemoveSprite(spriteId));
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
    if (!sprite) return;
    log.info('handleSwap', 'request sprite swap', { spriteId: sprite.id });
    onSwapSprite(sprite.id);
  };

  // ── Subset Add Sprite ──────────────────────────────────────────────────────
  const selectionSize = selectedSwapCells.size;
  const stageSelectable =
    selectedSwap !== null && !compareMode && !isSubmitting && !isRunning;
  const canAddSprite =
    selectionSize > 0 && !isSubmitting && !isRunning && !anySpriteSwapRunning;
  const addSpriteTooltip =
    selectionSize === 0
      ? 'Tick the variants you want in a new sprite first — checkboxes on each cell in the swap result'
      : anySpriteSwapRunning
        ? 'Wait until the current swap finishes'
        : '';

  const handleAddSprite = useCallback(async () => {
    if (selectionSize === 0) {
      log.warn('handleAddSprite', 'empty selection — abort', {});
      return;
    }
    if (anySpriteSwapRunning || isSubmitting || isRunning) {
      log.warn('handleAddSprite', 'busy — abort', {
        anySpriteSwapRunning,
        isSubmitting,
        isRunning,
      });
      return;
    }
    const activeSpriteId = activeSpriteRef?.spriteId;
    if (!activeSpriteId) {
      log.warn('handleAddSprite', 'no active sprite — abort', {});
      return;
    }

    log.info('handleAddSprite', 'start subset add sprite', {
      activeSpriteId,
      selectionSize,
    });

    try {
      const newSpriteId = await addSprite(remixId, activeSpriteId, selectedSwapCells);
      if (newSpriteId === null) {
        log.error('handleAddSprite', 'addSprite returned null', {});
        toast.error("Couldn't add sprite — try again");
        clearSwapCellSelection();
        return;
      }
      clearSwapCellSelection();
      onActivateSprite({ spriteId: newSpriteId, sheetIndex: 0 });
      log.info('handleAddSprite', 'success', { newSpriteId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add sprite';
      log.error('handleAddSprite', 'failed', { error: msg });
      toast.error(msg);
      clearSwapCellSelection();
    }
  }, [
    selectionSize,
    anySpriteSwapRunning,
    isSubmitting,
    isRunning,
    activeSpriteRef,
    addSprite,
    remixId,
    selectedSwapCells,
    clearSwapCellSelection,
    onActivateSprite,
  ]);

  return (
    <>
      <SpritesSidebar
        sprites={sprites}
        activeSpriteRef={activeSpriteRef}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        anySpriteSwapRunning={anySpriteSwapRunning}
        canAddSprite={canAddSprite}
        addSpriteTooltip={addSpriteTooltip}
        selectionSize={selectionSize}
        onSelectSpriteSheet={onSelectSpriteSheet}
        onAddSprite={handleAddSprite}
        onRemoveSprite={handleRemoveSprite}
        onAddSheet={handleAddSheet}
        onRemoveSheet={handleRemoveSheet}
      />

      {sprite ? (
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
          selectedSwapCropKeys={selectedSwapCells}
          onToggleSwapCropSelection={toggleSwapCellSelection}
          cropKeyOf={spriteCropKeyOf}
          getOwnership={getOwnership}
          onTakeBack={handleTakeBack}
          takeBackDisabled={anySpriteSwapRunning}
        />
      ) : (
        <section
          className="flex h-full min-w-0 flex-1 items-center justify-center bg-[var(--swap-modal-bg)] p-8 text-center"
          aria-label="Sprites stage"
        >
          <p className="text-sm text-[var(--swap-modal-text-muted)]">
            Thêm một sprite để bắt đầu.
          </p>
        </section>
      )}

      <RelayoutConfirmDialog
        open={pending != null}
        kind={pending?.kind ?? 'remove-sheet'}
        batchName={pending?.spriteName ?? ''}
        onConfirm={confirmPending}
        onCancel={cancelPending}
      />
    </>
  );
}
