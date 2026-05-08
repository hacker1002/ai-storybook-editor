// animation-editor-sidebar.tsx - Sidebar panel for the animation editor (280px)
// Pure editor component: CRUD, filter, drag-reorder. No player/playback logic.

import { useState, useMemo } from 'react';
import type { ItemType } from '@/types/spread-types';
import type {
  ResolvedAnimation,
  AnimationFilterState,
  ObjectFilterOption,
  AvailableEffect,
  SelectedItem,
  SpreadAnimation,
  EffectCategory,
} from '@/types/animation-types';
import { STAR_COLOR_MAP, EFFECT_CATEGORY_LABELS } from '@/constants/animation-constants';
import { buildDefaultEffect, computeStepNumbers } from './utils';
import { useCanvasWidth, useCanvasHeight } from '@/stores/editor-settings-store';
import { useRetouchSpreadIds, useRetouchSpreads } from '@/stores/snapshot-store/selectors';
import { useSpaceViewState, useEffectiveSpreadId } from '@/features/editor/hooks/use-space-view-state';
import { AnimationFilterPopover } from './animation-filter-popover';
import { AnimationListItem } from './animation-list-item';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, Plus, Star } from 'lucide-react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'AnimationEditorSidebar');

interface AnimationEditorSidebarProps {
  animations: ResolvedAnimation[];          // filtered list to display
  allAnimations: ResolvedAnimation[];       // unfiltered (for filter popover context)
  selectedItem: SelectedItem | null;
  expandedAnimationIndex: number | null;    // parent-controlled expand state
  availableEffects: AvailableEffect[];      // for + button dropdown, filtered by selectedItem.type

  // Filter
  filterState: AnimationFilterState;
  objectFilterOptions: ObjectFilterOption[];
  onFilterChange: (updates: Partial<AnimationFilterState>) => void;

  // Expand
  onExpandChange: (index: number | null) => void;

  // CRUD
  onAddAnimation: (effectType: number) => void;
  onUpdateAnimation: (index: number, updates: Partial<SpreadAnimation>) => void;
  onDeleteAnimation: (index: number) => void;
  onReorderAnimation: (fromIndex: number, toIndex: number) => void;

  // Canvas selection — clicking sidebar item selects its target on canvas
  onItemSelect?: (itemType: ItemType | null, itemId: string | null) => void;

  // Read-along conditional visibility — true when target textbox has audio
  targetHasAudio?: boolean;
}

export function AnimationEditorSidebar({
  animations,
  selectedItem,
  expandedAnimationIndex,
  availableEffects,
  filterState,
  objectFilterOptions,
  onFilterChange,
  onExpandChange,
  onAddAnimation,
  onUpdateAnimation,
  onDeleteAnimation,
  onReorderAnimation,
  onItemSelect,
  targetHasAudio,
}: AnimationEditorSidebarProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Spread ratio used by buildDefaultEffect for Camera Zoom (19) default geometry
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const spreadRatio = canvasHeight > 0 ? canvasWidth / canvasHeight : 1;

  // Camera Zoom (effect 19) is spread-level — always allowed regardless of selectedItem.
  // Per-item effects (incl. Camera Focus 18) still need a selected item; rendered disabled when not.
  const isAddEnabled = true;
  const hasActiveFilter =
    filterState.objectFilter !== 'all' ||
    filterState.effectFilter !== 'all' ||
    filterState.triggerFilters.size > 0;

  const effectsByCategory = useMemo(() => {
    const grouped = new Map<EffectCategory, AvailableEffect[]>();
    for (const effect of availableEffects) {
      const list = grouped.get(effect.category) ?? [];
      list.push(effect);
      grouped.set(effect.category, list);
    }
    return grouped;
  }, [availableEffects]);

  const categoryOrder: EffectCategory[] = ['play', 'read-along', 'entrance', 'emphasis', 'camera', 'exit', 'motion-paths'];

  const stepNumbers = useMemo(() => computeStepNumbers(animations), [animations]);

  // ---- Composite cross-link highlight ----
  // Resolve current spread to know composites; highlights an animation when:
  //  (a) its target.id === selectedItem.id (direct), OR
  //  (b) selectedItem is a variant of a composite AND animation.target.id === parentComposite.id, OR
  //  (c) selectedItem.type === 'composite' AND animation.target.id === selectedItem.id.
  const retouchSpreadIds = useRetouchSpreadIds();
  const retouchSpreads = useRetouchSpreads();
  const { activeSpreadId } = useSpaceViewState('animation');
  const effectiveSpreadId = useEffectiveSpreadId(activeSpreadId, retouchSpreadIds);

  const matchingIndexSet = useMemo(() => {
    const set = new Set<number>();
    if (!selectedItem) return set;
    const spread = retouchSpreads.find((s) => s.id === effectiveSpreadId);
    const parentComposite = spread?.composites?.find((c) =>
      c.variants.some((v) => v.id === selectedItem.id),
    );
    animations.forEach((resolved, i) => {
      const tid = resolved.animation.target.id;
      if (tid === selectedItem.id) set.add(i);
      else if (parentComposite && tid === parentComposite.id) set.add(i);
      else if (selectedItem.type === 'composite' && tid === selectedItem.id) set.add(i);
    });
    return set;
  }, [selectedItem, animations, retouchSpreads, effectiveSpreadId]);

  // ---------- Drag reorder handlers ----------

  function handleDragStart(index: number) {
    setDragIndex(index);
    setDragOverIndex(null);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && index !== dragIndex) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      log.info('handleDrop', 'animation reordered', { from: dragIndex, to: targetIndex });
      onReorderAnimation(
        animations[dragIndex].originalIndex,
        animations[targetIndex].originalIndex,
      );
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // ---------- Settings callback wrappers ----------

  function makeEffectTypeChange(animOriginalIndex: number) {
    return (newEffectType: number) => {
      const newEffect = buildDefaultEffect(newEffectType, undefined, spreadRatio);
      const updates: Partial<SpreadAnimation> = { effect: newEffect };
      // Camera animations cannot click_loop — reset alongside type change.
      if (newEffectType === 18 || newEffectType === 19) {
        updates.click_loop = 0;
        log.info('makeEffectTypeChange', 'reset click_loop for camera', { newEffectType });
      }
      onUpdateAnimation(animOriginalIndex, updates);
    };
  }

  function makeTriggerTypeChange(animOriginalIndex: number, animation: ResolvedAnimation) {
    return (trigger: SpreadAnimation['trigger_type']) => {
      const updates: Partial<SpreadAnimation> = { trigger_type: trigger };
      const isCamera = animation.animation.effect.type === 18 || animation.animation.effect.type === 19;
      if (trigger !== 'on_click' || isCamera) {
        updates.click_loop = 0;
      }
      onUpdateAnimation(animOriginalIndex, updates);
    };
  }

  function makeClickLoopChange(animOriginalIndex: number, animation: ResolvedAnimation) {
    return (value: number) => {
      const effectType = animation.animation.effect.type;
      if (effectType === 18 || effectType === 19) {
        log.warn('makeClickLoopChange', 'click_loop not supported for camera', {
          effectType,
          attempted: value,
        });
        return;
      }
      onUpdateAnimation(animOriginalIndex, { click_loop: value });
    };
  }

  function makeMustCompleteChange(animOriginalIndex: number) {
    return (value: boolean) => {
      onUpdateAnimation(animOriginalIndex, { must_complete: value });
    };
  }

  function makeEffectOptionChange(animOriginalIndex: number, animation: ResolvedAnimation) {
    return (field: string, value: number | string) => {
      const currentEffect = animation.animation.effect;
      let nextEffect: SpreadAnimation['effect'];
      if (field === 'payload.ease_time') {
        nextEffect = {
          ...currentEffect,
          payload: { ...(currentEffect.payload ?? {}), ease_time: Number(value) },
        };
      } else {
        nextEffect = { ...currentEffect, [field]: value };
      }
      onUpdateAnimation(animOriginalIndex, { effect: nextEffect });
    };
  }

  function makeSelectTarget(animation: ResolvedAnimation) {
    return () => {
      const { target } = animation.animation;
      // Camera Zoom (target.type='spread') has no underlying item to select
      if (target.type === 'spread') {
        onItemSelect?.(null, null);
        return;
      }
      onItemSelect?.(target.type, target.id);
    };
  }

  // ---------- Render ----------

  return (
    <aside
      role="navigation"
      aria-label="Animation editor sidebar"
      className="flex h-full w-[280px] flex-col border-r bg-muted/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 h-14 shrink-0">

        {/* Left: filter popover trigger */}
        <AnimationFilterPopover
          open={filterPopoverOpen}
          onOpenChange={setFilterPopoverOpen}
          filterState={filterState}
          objectFilterOptions={objectFilterOptions}
          onFilterChange={onFilterChange}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Filter animations"
          >
            <Filter
              className={[
                'h-3.5 w-3.5',
                hasActiveFilter ? 'text-blue-500' : 'text-muted-foreground',
              ].join(' ')}
            />
          </Button>
        </AnimationFilterPopover>

        {/* Center: title */}
        <span className="text-sm font-semibold">Animations</span>

        {/* Right: add animation popover */}
        <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!isAddEnabled}
              aria-label="Add animation"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <div className="space-y-2">
              {categoryOrder.map((category) => {
                const effects = effectsByCategory.get(category);
                if (!effects || effects.length === 0) return null;
                return (
                  <div key={category}>
                    <p className="px-2 py-1 text-xs text-muted-foreground font-medium">
                      {EFFECT_CATEGORY_LABELS[category]}
                    </p>
                    {effects.map((effect) => {
                      // Camera Focus (18) requires a selected item; Zoom (19) does not.
                      const isDisabled = effect.id === 18 && selectedItem === null;
                      const tooltip = isDisabled
                        ? 'Select an item to focus on'
                        : effect.name;
                      return (
                        <button
                          key={effect.id}
                          disabled={isDisabled}
                          title={tooltip}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          onClick={() => {
                            if (isDisabled) return;
                            log.info('handleAddDropdownClick', 'effect selected', {
                              effectType: effect.id,
                              hasSelectedItem: !!selectedItem,
                            });
                            onAddAnimation(effect.id);
                            setAddMenuOpen(false);
                          }}
                        >
                          <Star
                            className="h-3 w-3 shrink-0"
                            style={{
                              fill: STAR_COLOR_MAP[effect.category],
                              stroke: STAR_COLOR_MAP[effect.category],
                            }}
                          />
                          {effect.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Animation list */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {animations.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground text-center">
              {hasActiveFilter
                ? 'No animations match current filter'
                : 'Select an item and click + to add'}
            </p>
          </div>
        ) : (
          animations.map((resolvedAnim, index) => (
            <AnimationListItem
              key={`${resolvedAnim.originalIndex}-${resolvedAnim.animation.effect.type}`}
              animation={resolvedAnim}
              index={index}
              stepNumber={stepNumbers[index]}
              isExpanded={index === expandedAnimationIndex}
              isHighlighted={matchingIndexSet.has(index)}
              isDragOver={index === dragOverIndex}
              onClick={() =>
                onExpandChange(index === expandedAnimationIndex ? null : index)
              }
              onDelete={() => onDeleteAnimation(resolvedAnim.originalIndex)}
              onSelectTarget={makeSelectTarget(resolvedAnim)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onEffectTypeChange={makeEffectTypeChange(resolvedAnim.originalIndex)}
              onTriggerTypeChange={makeTriggerTypeChange(resolvedAnim.originalIndex, resolvedAnim)}
              onClickLoopChange={makeClickLoopChange(resolvedAnim.originalIndex, resolvedAnim)}
              onEffectOptionChange={makeEffectOptionChange(resolvedAnim.originalIndex, resolvedAnim)}
              onMustCompleteChange={makeMustCompleteChange(resolvedAnim.originalIndex)}
              targetHasAudio={targetHasAudio}
            />
          ))
        )}
      </div>
    </aside>
  );
}
