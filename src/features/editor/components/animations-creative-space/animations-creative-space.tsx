// animations-creative-space.tsx - Store-connected root for animation editor workspace
// Connects RetouchSlice store data to AnimationEditorSidebar + PlayableSpreadView.
"use client";

import { useState, useCallback, useMemo } from "react";
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
} from "./utils";
import { createLogger } from "@/utils/logger";
import { EFFECT_TYPE } from "@/constants/animation-constants";
import { fetchMediaDurationMs, findMediaUrlFromSpread } from "@/utils/media-duration-utils";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";

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

  // --- Local state ---
  const [userSelectedSpreadId, setUserSelectedSpreadId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [expandedAnimIndex, setExpandedAnimIndex] = useState<number | null>(null);
  const [filterState, setFilterState] = useState<AnimationFilterState>(createDefaultFilterState);

  // Derived: effective spread ID (user choice if valid, else first)
  const effectiveSpreadId = useMemo(() => {
    if (userSelectedSpreadId && retouchSpreadIds.includes(userSelectedSpreadId)) {
      return userSelectedSpreadId;
    }
    return retouchSpreadIds[0] ?? null;
  }, [retouchSpreadIds, userSelectedSpreadId]);

  const currentSpread = useRetouchSpreadById(effectiveSpreadId ?? "");
  const animations = useRetouchAnimations(effectiveSpreadId ?? "");

  // --- Derived data (useMemo) ---
  const languageCode = currentLanguage.code;
  const itemsMap = useMemo(
    () => buildItemsMap(currentSpread, languageCode),
    [currentSpread, languageCode],
  );

  const resolvedAnimations = useMemo(
    () => resolveAnimations(animations, itemsMap),
    [animations, itemsMap],
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
    log.debug('selectedItemHasAudio', 'check', { id: selectedItem.id, hasAudio: !!result?.content?.audio, mediaLen: result?.content?.audio?.media?.length });
    return Boolean(result?.content?.audio?.media?.length);
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
    return Boolean(result?.content?.audio?.media?.length);
  }, [expandedAnimIndex, filteredAnimations, currentSpread, languageCode, selectedItemHasAudio]);

  const availableEffects = useMemo(
    () => (selectedItem ? getAvailableEffects(selectedItem.type, selectedItemHasAudio) : []),
    [selectedItem, selectedItemHasAudio],
  );

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
    setUserSelectedSpreadId(spreadId);
    setSelectedItem(null);
    setExpandedAnimIndex(null);
  }, []);

  const handleAddAnimation = useCallback(
    async (effectType: number) => {
      if (!selectedItem || !effectiveSpreadId) return;
      log.info("handleAddAnimation", "adding animation", {
        effectType,
        targetId: selectedItem.id,
        targetType: selectedItem.type,
      });

      const maxOrder = animations.reduce((max, a) => Math.max(max, a.order), -1);
      const effect = buildDefaultEffect(effectType);

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
          const media = result?.content?.audio?.media;
          const syncedMedia = media?.find((m) => m.script_synced) ?? media?.[0];
          if (syncedMedia?.url) {
            const durationMs = await fetchMediaDurationMs(syncedMedia.url);
            if (durationMs) {
              effect.duration = durationMs;
              log.debug("handleAddAnimation", "auto-set read-along duration from narration audio", { durationMs });
            }
          }
        }
      }

      const newAnimation: SpreadAnimation = {
        order: maxOrder + 1,
        type: 0,
        target: {
          id: selectedItem.id,
          type: selectedItem.type as SpreadAnimation["target"]["type"],
        },
        trigger_type: "on_next",
        effect,
      };

      actions.addRetouchAnimation(effectiveSpreadId, newAnimation);
      setExpandedAnimIndex(animations.length);
    },
    [selectedItem, effectiveSpreadId, animations.length, actions, currentSpread, languageCode],
  );

  const handleUpdateAnimation = useCallback(
    (index: number, updates: Partial<SpreadAnimation>) => {
      if (!effectiveSpreadId) return;
      log.debug("handleUpdateAnimation", "updating", { index, keys: Object.keys(updates) });

      // Component must merge effect fields before calling store (shallow replace)
      if (updates.effect && animations[index]) {
        const current = animations[index];
        const merged: Partial<SpreadAnimation> = {
          ...updates,
          effect: { ...current.effect, ...updates.effect },
        };
        actions.updateRetouchAnimation(effectiveSpreadId, index, merged);
      } else {
        actions.updateRetouchAnimation(effectiveSpreadId, index, updates);
      }
    },
    [effectiveSpreadId, animations, actions],
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
      log.debug("handleReorderAnimation", "reordering", { fromIndex, toIndex });
      actions.reorderRetouchAnimations(effectiveSpreadId, fromIndex, toIndex);
    },
    [effectiveSpreadId, actions],
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
          selectedItemId={selectedItem?.id ?? null}
          selectedItemType={selectedItem?.type ?? null}
          onItemSelect={handleItemSelect}
          onSpreadSelect={handleSpreadSelect}
          onPreview={onNavigateToPreview}
        />
      </div>
    </div>
  );
}
