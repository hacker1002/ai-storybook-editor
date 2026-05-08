// animations-creative-space.tsx - Store-connected root for animation editor workspace
// Connects RetouchSlice store data to AnimationEditorSidebar + PlayableSpreadView.
"use client";

import { useState, useCallback, useMemo } from "react";
import { useSpaceViewState, useEffectiveSpreadId } from "@/features/editor/hooks/use-space-view-state";
import { AnimationEditorSidebar } from "./animation-editor-sidebar";
import {
  PlayableSpreadView,
  type PlayableSpread,
} from "@/features/editor/components/playable-spread-view";
import {
  useRetouchSpreadIds,
  useRetouchSpreads,
  useRetouchSpreadById,
  useRetouchAnimations,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { useCurrentLanguage } from "@/stores/editor-settings-store";
import { useBookTemplateLayout } from "@/stores/book-store";
import type { SpreadAnimation } from "@/types/spread-types";
import type {
  AnimationFilterState,
  SelectedItem,
  ItemType,
} from "@/types/animation-types";
import {
  resolveAnimations,
  filterAnimations,
  buildObjectFilterOptions,
  getAvailableEffects,
  buildDefaultEffect,
  createDefaultFilterState,
  buildItemsMap,
  inferEffectTypeForComposite,
} from "./utils";
import { createLogger } from "@/utils/logger";
import { EFFECT_TYPE } from "@/constants/animation-constants";
import { EFFECT_TYPE_NAMES, PLAYABLE_ZOOM } from "@/constants/playable-constants";
import { fetchMediaDurationMs, findMediaUrlFromSpread } from "@/utils/media-duration-utils";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import { computePlayEffectDuration } from "@/features/editor/utils/compute-play-effect-duration";
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
import type { ZoomAreaGeometry } from "@/features/editor/components/playable-spread-view/zoom-area-overlay-utils";

const log = createLogger("Editor", "AnimationsCreativeSpace");

interface AnimationsCreativeSpaceProps {
  onNavigateToPreview?: () => void;
}

export function AnimationsCreativeSpace({ onNavigateToPreview }: AnimationsCreativeSpaceProps) {
  // --- Store selectors ---
  const retouchSpreadIds = useRetouchSpreadIds();
  const retouchSpreads = useRetouchSpreads();
  const currentLanguage = useCurrentLanguage();
  const actions = useSnapshotActions();
  const templateLayout = useBookTemplateLayout();

  // --- Space view state (ADR-021) ---
  const { activeSpreadId, zoomLevel, patch } = useSpaceViewState('animation');

  // --- Local state ---
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [expandedAnimIndex, setExpandedAnimIndex] = useState<number | null>(null);
  const [filterState, setFilterState] = useState<AnimationFilterState>(createDefaultFilterState);
  const [drawZoomAreaMode, setDrawZoomAreaMode] = useState(false);

  // Spread ratio for Camera Zoom default geometry / overlay aspect lock
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const spreadRatio = useMemo(
    () => (canvasHeight > 0 ? canvasWidth / canvasHeight : 1),
    [canvasWidth, canvasHeight],
  );

  // Derived: effective spread ID (persisted choice if valid, else first)
  const effectiveSpreadId = useEffectiveSpreadId(activeSpreadId, retouchSpreadIds);

  const currentSpread = useRetouchSpreadById(effectiveSpreadId ?? "");
  const animations = useRetouchAnimations(effectiveSpreadId ?? "");

  // --- Derived data (useMemo) ---
  const languageCode = currentLanguage.code;
  const itemsMap = useMemo(
    () => buildItemsMap(currentSpread, languageCode),
    [currentSpread, languageCode],
  );

  const resolvedAnimations = useMemo(
    () => resolveAnimations(animations, itemsMap, currentSpread),
    [animations, itemsMap, currentSpread],
  );

  const filteredAnimations = useMemo(
    () => filterAnimations(resolvedAnimations, filterState),
    [resolvedAnimations, filterState],
  );

  const objectFilterOptions = useMemo(
    () => buildObjectFilterOptions(resolvedAnimations, itemsMap),
    [resolvedAnimations, itemsMap],
  );

  // Check if the selected item (for "+" add dropdown) is a textbox with audio
  const selectedItemHasAudio = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'textbox') return false;
    const textbox = currentSpread?.textboxes?.find((t) => t.id === selectedItem.id);
    if (!textbox) { log.debug('selectedItemHasAudio', 'textbox not found', { id: selectedItem.id, spreadHasTextboxes: !!currentSpread?.textboxes, textboxCount: currentSpread?.textboxes?.length }); return false; }
    const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, languageCode);
    const hasCombined = result?.content?.audio?.combined_audio_url != null;
    log.debug('selectedItemHasAudio', 'check', { id: selectedItem.id, hasAudio: !!result?.content?.audio, hasCombined });
    return hasCombined;
  }, [selectedItem, currentSpread, languageCode]);

  // Check if the expanded animation's target textbox has audio (for effect-type grid)
  const targetHasAudio = useMemo(() => {
    if (expandedAnimIndex === null) return selectedItemHasAudio;
    const expandedAnimation = filteredAnimations[expandedAnimIndex];
    if (!expandedAnimation) return false;
    const target = expandedAnimation.animation.target;
    if (target.type !== 'textbox') return false;
    const textbox = currentSpread?.textboxes?.find((t) => t.id === target.id);
    if (!textbox) return false;
    const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, languageCode);
    return result?.content?.audio?.combined_audio_url != null;
  }, [expandedAnimIndex, filteredAnimations, currentSpread, languageCode, selectedItemHasAudio]);

  // Resolve effect-grid matrix type considering composite re-target rule:
  // - If selectedItem is a variant of a composite → use restrictive composite matrix.
  // - If selectedItem.type === 'composite' (composite group selection) → infer matrix.
  // - Else → variant type as-is.
  const effectMatrixType = useMemo<ItemType | null>(() => {
    if (!selectedItem) return null;
    const parent = currentSpread?.composites?.find((c) =>
      c.variants.some((v) => v.id === selectedItem.id),
    );
    if (parent) return inferEffectTypeForComposite(parent);
    if (selectedItem.type === 'composite') {
      const composite = currentSpread?.composites?.find((c) => c.id === selectedItem.id);
      if (composite) return inferEffectTypeForComposite(composite);
      return 'image';
    }
    return selectedItem.type;
  }, [selectedItem, currentSpread]);

  const availableEffects = useMemo(() => {
    const base = effectMatrixType ? getAvailableEffects(effectMatrixType, selectedItemHasAudio) : [];
    // Camera Zoom (19) is spread-level — always offer regardless of selectedItem.
    const hasZoom = base.some((e) => e.id === 19);
    if (!hasZoom) {
      base.push({
        id: 19,
        name: EFFECT_TYPE_NAMES[19] ?? 'Zoom In',
        category: 'camera',
      });
    }
    return base;
  }, [effectMatrixType, selectedItemHasAudio]);

  // Currently expanded animation (raw, for canvas overlay)
  const expandedAnimationRaw = useMemo<SpreadAnimation | null>(() => {
    if (expandedAnimIndex === null) return null;
    const resolved = filteredAnimations[expandedAnimIndex];
    return resolved?.animation ?? null;
  }, [expandedAnimIndex, filteredAnimations]);

  const expandedAnimationOriginalIndex = useMemo<number | null>(() => {
    if (expandedAnimIndex === null) return null;
    const resolved = filteredAnimations[expandedAnimIndex];
    return resolved?.originalIndex ?? null;
  }, [expandedAnimIndex, filteredAnimations]);

  // Build PlayableSpread[] from retouch spreads
  // Language resolution is handled by child components via getTextboxContentForLanguage
  const playableSpreads = useMemo((): PlayableSpread[] => {
    return retouchSpreads.map((spread) => ({
      ...spread,
      animations: spread.animations ?? [],
    } as PlayableSpread));
  }, [retouchSpreads]);

  // --- Handlers ---
  const handleItemSelect = useCallback(
    (itemType: ItemType | null, itemId: string | null) => {
      log.debug("handleItemSelect", "item selected", { itemType, itemId });
      setExpandedAnimIndex(null);
      if (itemType !== null && itemId !== null) {
        setSelectedItem({ id: itemId, type: itemType });
      } else {
        setSelectedItem(null);
      }
    },
    [],
  );

  const handleSpreadSelect = useCallback((spreadId: string) => {
    log.info("handleSpreadSelect", "spread selected", { spreadId });
    patch({ activeSpreadId: spreadId });
    setSelectedItem(null);
    setExpandedAnimIndex(null);
    setDrawZoomAreaMode(false);
  }, [patch]);

  const handleAddAnimation = useCallback(
    async (effectType: number) => {
      if (!effectiveSpreadId) return;

      // Camera Zoom (19) — spread-level: enter draw mode, animation created on draw complete.
      if (effectType === 19) {
        log.info("handleAddAnimation", "enable draw zoom area mode", {});
        setDrawZoomAreaMode(true);
        return;
      }

      // Camera Focus (18) — per-item; falls through to existing flow that requires selectedItem.
      if (!selectedItem) {
        log.debug("handleAddAnimation", "skip — no selected item for per-item effect", { effectType });
        return;
      }

      // Composite re-target rule: if selectedItem is a variant of a composite,
      // route the animation target to the composite instead of the variant.
      const parentComposite = currentSpread?.composites?.find((c) =>
        c.variants.some((v) => v.id === selectedItem.id),
      );
      const resolvedTarget: SpreadAnimation["target"] = parentComposite
        ? { id: parentComposite.id, type: 'composite' }
        : { id: selectedItem.id, type: selectedItem.type as SpreadAnimation["target"]["type"] };

      const effectItemType: ItemType = parentComposite
        ? inferEffectTypeForComposite(parentComposite)
        : selectedItem.type;

      log.info("handleAddAnimation", "adding animation", {
        effectType,
        targetId: resolvedTarget.id,
        targetType: resolvedTarget.type,
        rerouted: !!parentComposite,
      });
      if (parentComposite) {
        log.debug("handleAddAnimation", "re-target to composite", {
          variantId: selectedItem.id,
          compositeId: parentComposite.id,
          effectItemType,
        });
      }

      const maxOrder = animations.reduce((max, a) => Math.max(max, a.order), -1);
      const effect = buildDefaultEffect(effectType, effectItemType, spreadRatio);

      // Skip auto-fetch media duration for composite: composite has no direct media_url.
      if (resolvedTarget.type !== 'composite') {
        // Auto-set duration for Play effect on video/audio targets
        if (effectType === EFFECT_TYPE.PLAY && (selectedItem.type === 'video' || selectedItem.type === 'audio')) {
          const mediaUrl = findMediaUrlFromSpread(currentSpread, selectedItem.id, selectedItem.type);
          if (mediaUrl) {
            const durationMs = await fetchMediaDurationMs(mediaUrl);
            if (durationMs) {
              effect.duration = durationMs;
              log.debug("handleAddAnimation", "auto-set play duration from media", { durationMs });
            }
          }
        }

        // Auto-set duration for Read-Along effect on textbox targets
        if (effectType === EFFECT_TYPE.READ_ALONG && selectedItem.type === 'textbox') {
          const textbox = currentSpread?.textboxes?.find((tb) => tb.id === selectedItem.id);
          if (textbox) {
            const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, languageCode);
            const url = result?.content?.audio?.combined_audio_url;
            if (url) {
              const durationMs = await fetchMediaDurationMs(url);
              if (durationMs) {
                effect.duration = durationMs;
                log.debug("handleAddAnimation", "auto-set read-along duration from narration audio", { durationMs });
              }
            }
          }
        }
      } else {
        log.debug("handleAddAnimation", "skip media duration auto-fetch for composite target", {
          compositeId: resolvedTarget.id,
        });
      }

      const newAnimation: SpreadAnimation = {
        order: maxOrder + 1,
        type: 0,
        target: resolvedTarget,
        trigger_type: "on_next",
        effect,
      };

      actions.addRetouchAnimation(effectiveSpreadId, newAnimation);
      setExpandedAnimIndex(animations.length);
    },
    [selectedItem, effectiveSpreadId, animations, actions, currentSpread, languageCode, spreadRatio],
  );

  const handleDrawZoomAreaComplete = useCallback(
    (geometry: ZoomAreaGeometry) => {
      if (!effectiveSpreadId) return;
      log.info("handleDrawZoomAreaComplete", "create camera zoom animation", { w: geometry.w, h: geometry.h });
      const maxOrder = animations.reduce((max, a) => Math.max(max, a.order), -1);
      const newAnimation: SpreadAnimation = {
        order: maxOrder + 1,
        type: 0,
        target: { id: 'spread', type: 'spread' },
        trigger_type: 'on_next',
        effect: {
          type: 19,
          delay: 0,
          duration: 3000,
          geometry,
          payload: { ease_time: 500 },
        },
      };
      actions.addRetouchAnimation(effectiveSpreadId, newAnimation);
      setExpandedAnimIndex(animations.length);
      setDrawZoomAreaMode(false);
    },
    [effectiveSpreadId, animations, actions],
  );

  const handleDrawZoomAreaCancel = useCallback(() => {
    log.debug("handleDrawZoomAreaCancel", "cancel draw mode", {});
    setDrawZoomAreaMode(false);
  }, []);

  const handleCameraZoomGeometryChange = useCallback(
    (animationIndex: number, geometry: ZoomAreaGeometry) => {
      if (!effectiveSpreadId) return;
      const current = animations[animationIndex];
      if (!current) {
        log.warn("handleCameraZoomGeometryChange", "animation not found", { animationIndex });
        return;
      }
      log.debug("handleCameraZoomGeometryChange", "update geometry", { animationIndex });
      actions.updateRetouchAnimation(effectiveSpreadId, animationIndex, {
        effect: { ...current.effect, geometry },
      });
    },
    [effectiveSpreadId, animations, actions],
  );

  const handleUpdateAnimation = useCallback(
    (index: number, updates: Partial<SpreadAnimation>) => {
      if (!effectiveSpreadId) return;
      log.debug("handleUpdateAnimation", "updating", { index, keys: Object.keys(updates) });

      // Component must merge effect fields before calling store (shallow replace)
      if (updates.effect && animations[index]) {
        const current = animations[index];
        const mergedEffect = { ...current.effect, ...updates.effect };

        // Auto-sync effect.duration for PLAY + audio target on loop/type change.
        const isPlayAudio =
          mergedEffect.type === EFFECT_TYPE.PLAY && current.target.type === 'audio';
        const loopChanged = updates.effect.loop !== undefined;
        const typeChangedToPlay =
          updates.effect.type === EFFECT_TYPE.PLAY && current.effect.type !== EFFECT_TYPE.PLAY;

        if (isPlayAudio && (loopChanged || typeChangedToPlay)) {
          const audio = currentSpread?.audios?.find((a) => a.id === current.target.id);
          if (audio?.media_length && audio.media_length > 0) {
            const newDuration = computePlayEffectDuration({
              loop: mergedEffect.loop,
              media_length: audio.media_length,
            });
            if (newDuration !== undefined) {
              log.info("handleUpdateAnimation", "auto-sync effect.duration", {
                animationId: current.target.id,
                loop: mergedEffect.loop,
                media_length: audio.media_length,
                newDuration,
              });
              mergedEffect.duration = newDuration;
            }
          } else {
            log.warn("handleUpdateAnimation", "media_length missing — keeping user-set duration", {
              audioId: current.target.id,
            });
          }
        }

        const merged: Partial<SpreadAnimation> = {
          ...updates,
          effect: mergedEffect,
        };
        actions.updateRetouchAnimation(effectiveSpreadId, index, merged);
      } else {
        actions.updateRetouchAnimation(effectiveSpreadId, index, updates);
      }
    },
    [effectiveSpreadId, animations, actions, currentSpread],
  );

  const handleDeleteAnimation = useCallback(
    (index: number) => {
      if (!effectiveSpreadId) return;
      log.info("handleDeleteAnimation", "deleting", { index });
      actions.deleteRetouchAnimation(effectiveSpreadId, index);
      if (expandedAnimIndex === index) {
        setExpandedAnimIndex(null);
      } else if (expandedAnimIndex !== null && expandedAnimIndex > index) {
        setExpandedAnimIndex(expandedAnimIndex - 1);
      }
    },
    [effectiveSpreadId, actions, expandedAnimIndex],
  );

  const handleReorderAnimation = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!effectiveSpreadId) return;
      log.debug("handleReorderAnimation", "reordering", { fromIndex, toIndex, expandedAnimIndex });
      actions.reorderRetouchAnimations(effectiveSpreadId, fromIndex, toIndex);

      // Keep expanded index tracking the same item after reorder
      setExpandedAnimIndex((prev) => {
        if (prev === null) return null;
        if (prev === fromIndex) return toIndex;
        if (fromIndex < toIndex && prev > fromIndex && prev <= toIndex) return prev - 1;
        if (fromIndex > toIndex && prev >= toIndex && prev < fromIndex) return prev + 1;
        return prev;
      });
    },
    [effectiveSpreadId, actions, expandedAnimIndex],
  );

  const handleFilterChange = useCallback((updates: Partial<AnimationFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  }, []);

  // --- Render ---
  log.debug("render", "AnimationsCreativeSpace", { spreadCount: retouchSpreadIds.length });

  if (retouchSpreadIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No spreads available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <AnimationEditorSidebar
        animations={filteredAnimations}
        allAnimations={resolvedAnimations}
        selectedItem={selectedItem}
        expandedAnimationIndex={expandedAnimIndex}
        availableEffects={availableEffects}
        filterState={filterState}
        objectFilterOptions={objectFilterOptions}
        onFilterChange={handleFilterChange}
        onExpandChange={setExpandedAnimIndex}
        onAddAnimation={handleAddAnimation}
        onUpdateAnimation={handleUpdateAnimation}
        onDeleteAnimation={handleDeleteAnimation}
        onReorderAnimation={handleReorderAnimation}
        onItemSelect={handleItemSelect}
        targetHasAudio={targetHasAudio}
      />
      <div className="flex-1 overflow-hidden">
        <PlayableSpreadView
          mode="animation-editor"
          spreads={playableSpreads}
          selectedSpreadId={effectiveSpreadId}
          zoomLevel={zoomLevel ?? PLAYABLE_ZOOM.DEFAULT}
          selectedItemId={selectedItem?.id ?? null}
          selectedItemType={selectedItem?.type ?? null}
          onItemSelect={handleItemSelect}
          onSpreadSelect={handleSpreadSelect}
          onZoomChange={(level) => patch({ zoomLevel: level })}
          onPreview={onNavigateToPreview}
          pageNumbering={templateLayout?.page_numbering}
          expandedAnimation={expandedAnimationRaw}
          expandedAnimationIndex={expandedAnimationOriginalIndex}
          allAnimations={animations}
          onCameraZoomGeometryChange={handleCameraZoomGeometryChange}
          drawZoomAreaMode={drawZoomAreaMode}
          onDrawZoomAreaComplete={handleDrawZoomAreaComplete}
          onDrawZoomAreaCancel={handleDrawZoomAreaCancel}
        />
      </div>
    </div>
  );
}
