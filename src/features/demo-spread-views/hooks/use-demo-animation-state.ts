// use-demo-animation-state.ts - Custom hook encapsulating animation state for the demo page
// Manages selected item, filter state, expanded index, and all CRUD animation handlers

import { useState, useMemo, useCallback } from 'react';
import type { PlayableSpread } from '@/types/playable-types';
import type { SpreadQuizContent } from '@/types/spread-types';
import type {
  SpreadAnimation,
  AnimationFilterState,
  SelectedItem,
  ResolvedAnimation,
  ObjectFilterOption,
  AvailableEffect,
  ItemType,
} from '@/types/animation-types';
import {
  resolveAnimations,
  filterAnimations,
  buildObjectFilterOptions,
  getAvailableEffects,
  buildDefaultEffect,
  createDefaultFilterState,
} from '@/features/editor/components/animations-creative-space';
import { createLogger } from '@/utils/logger';

const log = createLogger('Demo', 'useDemoAnimationState');

// Items map: item id -> { title, type }
type ItemsMap = Map<string, { title: string; type: string }>;

/** Builds an ItemsMap from all items in a spread for animation resolution */
function buildItemsMap(spread: PlayableSpread | undefined): ItemsMap {
  const map: ItemsMap = new Map();
  if (!spread) return map;

  for (const img of spread.images ?? []) {
    map.set(img.id, { title: img.title ?? img.id, type: 'image' });
  }
  for (const tb of spread.textboxes ?? []) {
    map.set(tb.id, { title: tb.title ?? tb.id, type: 'textbox' });
  }
  for (const sh of (spread as PlayableSpread & { shapes?: { id: string; title?: string }[] }).shapes ?? []) {
    map.set(sh.id, { title: sh.title ?? sh.id, type: 'shape' });
  }
  for (const vid of (spread as PlayableSpread & { videos?: { id: string; title?: string }[] }).videos ?? []) {
    map.set(vid.id, { title: vid.title ?? vid.id, type: 'video' });
  }
  for (const aud of (spread as PlayableSpread & { audios?: { id: string; title?: string }[] }).audios ?? []) {
    map.set(aud.id, { title: aud.title ?? aud.id, type: 'audio' });
  }
  for (const quiz of spread.quizzes ?? []) {
    // Resolve quiz display name: prefer root title, fallback to first language question
    const reserved = new Set(['id', 'title', 'geometry', 'z-index', 'player_visible', 'editor_visible', 'options']);
    let quizTitle = quiz.title ?? quiz.id;
    if (!quiz.title) {
      for (const key of Object.keys(quiz)) {
        if (reserved.has(key)) continue;
        const content = quiz[key] as SpreadQuizContent | undefined;
        if (content?.question) {
          quizTitle = content.question.length > 20 ? content.question.slice(0, 20) + '…' : content.question;
          break;
        }
      }
    }
    map.set(quiz.id, { title: quizTitle, type: 'quiz' });
  }

  return map;
}

export interface UseDemoAnimationStateParams {
  spreads: PlayableSpread[];
  selectedSpreadId: string | null;
  setSpreads: React.Dispatch<React.SetStateAction<PlayableSpread[]>>;
}

export interface UseDemoAnimationStateReturn {
  selectedItem: SelectedItem | null;
  filterState: AnimationFilterState;
  expandedAnimationIndex: number | null;
  availableEffects: AvailableEffect[];
  filteredAnimations: ResolvedAnimation[];
  allAnimations: ResolvedAnimation[];
  objectFilterOptions: ObjectFilterOption[];
  handleItemSelect: (itemType: ItemType | null, itemId: string | null) => void;
  handleExpandChange: (index: number | null) => void;
  handleAddAnimation: (effectType: number) => void;
  handleUpdateAnimation: (index: number, updates: Partial<SpreadAnimation>) => void;
  handleDeleteAnimation: (index: number) => void;
  handleReorderAnimation: (fromIndex: number, toIndex: number) => void;
  handleFilterChange: (updates: Partial<AnimationFilterState>) => void;
}

export function useDemoAnimationState({
  spreads,
  selectedSpreadId,
  setSpreads,
}: UseDemoAnimationStateParams): UseDemoAnimationStateReturn {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [expandedAnimationIndex, setExpandedAnimationIndex] = useState<number | null>(null);
  const [filterState, setFilterState] = useState<AnimationFilterState>(createDefaultFilterState);
  const [prevSpreadId, setPrevSpreadId] = useState(selectedSpreadId);

  // Reset expand state on spread change
  if (selectedSpreadId !== prevSpreadId) {
    setPrevSpreadId(selectedSpreadId);
    setExpandedAnimationIndex(null);
  }

  // --- Computed values ---

  const currentSpread = useMemo(
    () => spreads.find((s) => s.id === selectedSpreadId),
    [spreads, selectedSpreadId],
  );

  const itemsMap = useMemo(() => buildItemsMap(currentSpread), [currentSpread]);

  const allAnimations = useMemo(
    () => resolveAnimations(currentSpread?.animations ?? [], itemsMap),
    [currentSpread, itemsMap],
  );

  const filteredAnimations = useMemo(
    () => filterAnimations(allAnimations, filterState),
    [allAnimations, filterState],
  );

  const objectFilterOptions = useMemo(
    () => buildObjectFilterOptions(allAnimations, itemsMap),
    [allAnimations, itemsMap],
  );

  const availableEffects = useMemo(
    () => (selectedItem ? getAvailableEffects(selectedItem.type) : []),
    [selectedItem],
  );

  // --- Handlers ---

  const handleItemSelect = useCallback((itemType: ItemType | null, itemId: string | null) => {
    log.debug("handleItemSelect", "Item selected", { itemType, itemId });
    if (itemType !== null && itemId !== null) {
      setSelectedItem({ id: itemId, type: itemType });
    } else {
      setSelectedItem(null);
    }
  }, []);

  const handleExpandChange = useCallback((index: number | null) => {
    setExpandedAnimationIndex(index);
  }, []);

  const handleAddAnimation = useCallback(
    (effectType: number) => {
      if (!selectedItem || !selectedSpreadId) return;
      log.info("handleAddAnimation", "Adding animation", { effectType, targetId: selectedItem.id, targetType: selectedItem.type });

      setSpreads((prevSpreads) =>
        prevSpreads.map((spread) => {
          if (spread.id !== selectedSpreadId) return spread;
          const currentAnimations = spread.animations ?? [];
          const newAnimation: SpreadAnimation = {
            order: currentAnimations.length,
            type: 0,
            target: { id: selectedItem.id, type: selectedItem.type as SpreadAnimation['target']['type'] },
            trigger_type: 'after_previous',
            effect: buildDefaultEffect(effectType),
          };
          // Auto-expand newly added animation
          setExpandedAnimationIndex(currentAnimations.length);
          return { ...spread, animations: [...currentAnimations, newAnimation] };
        }),
      );
    },
    [selectedItem, selectedSpreadId, setSpreads],
  );

  const handleUpdateAnimation = useCallback(
    (index: number, updates: Partial<SpreadAnimation>) => {
      setSpreads((prevSpreads) =>
        prevSpreads.map((spread) => {
          if (spread.id !== selectedSpreadId) return spread;
          const animations = [...(spread.animations ?? [])];
          const current = animations[index];
          if (!current) return spread;

          // Special case: merge effect fields when updates contains 'effect'
          const merged: SpreadAnimation = updates.effect
            ? { ...current, ...updates, effect: { ...current.effect, ...updates.effect } }
            : { ...current, ...updates };

          animations[index] = merged;
          return { ...spread, animations };
        }),
      );
    },
    [selectedSpreadId, setSpreads],
  );

  const handleDeleteAnimation = useCallback(
    (index: number) => {
      setSpreads((prevSpreads) =>
        prevSpreads.map((spread) => {
          if (spread.id !== selectedSpreadId) return spread;
          const animations = (spread.animations ?? [])
            .filter((_, i) => i !== index)
            .map((anim, i) => ({ ...anim, order: i }));
          return { ...spread, animations };
        }),
      );
      if (expandedAnimationIndex === index) {
        setExpandedAnimationIndex(null);
      } else if (expandedAnimationIndex !== null && expandedAnimationIndex > index) {
        setExpandedAnimationIndex(expandedAnimationIndex - 1);
      }
    },
    [selectedSpreadId, setSpreads, expandedAnimationIndex],
  );

  const handleReorderAnimation = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSpreads((prevSpreads) =>
        prevSpreads.map((spread) => {
          if (spread.id !== selectedSpreadId) return spread;
          const animations = [...(spread.animations ?? [])];
          const [moved] = animations.splice(fromIndex, 1);
          animations.splice(toIndex, 0, moved);
          const reordered = animations.map((anim, i) => ({ ...anim, order: i }));
          return { ...spread, animations: reordered };
        }),
      );
    },
    [selectedSpreadId, setSpreads],
  );

  const handleFilterChange = useCallback((updates: Partial<AnimationFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  }, []);

  return {
    selectedItem,
    filterState,
    expandedAnimationIndex,
    availableEffects,
    filteredAnimations,
    allAnimations,
    objectFilterOptions,
    handleItemSelect,
    handleExpandChange,
    handleAddAnimation,
    handleUpdateAnimation,
    handleDeleteAnimation,
    handleReorderAnimation,
    handleFilterChange,
  };
}
