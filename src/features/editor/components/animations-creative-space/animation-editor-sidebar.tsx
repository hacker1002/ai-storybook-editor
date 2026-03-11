// animation-editor-sidebar.tsx - Sidebar panel for the animation editor (280px)
// Composes SidebarHeader, AnimationFilterPopover, AnimationListItem list, and EmptyState

import { useState, useMemo } from 'react';
import type {
  ResolvedAnimation,
  AnimationFilterState,
  ObjectFilterOption,
  AvailableEffect,
  SelectedItem,
  SpreadAnimation,
  EffectCategory,
} from './animation-types';
import { STAR_COLOR_MAP, EFFECT_CATEGORY_LABELS } from './animation-constants';
import { buildDefaultEffect } from './animation-utils';
import { AnimationFilterPopover } from './animation-filter-popover';
import { AnimationListItem } from './animation-list-item';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, Plus, Star } from 'lucide-react';

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
}: AnimationEditorSidebarProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Compute header state
  const isAddEnabled = selectedItem !== null;
  const hasActiveFilter =
    filterState.objectFilter !== 'all' ||
    filterState.effectFilter !== 'all' ||
    filterState.triggerFilters.size > 0;

  // Group availableEffects by category for the add dropdown
  const effectsByCategory = useMemo(() => {
    const grouped = new Map<EffectCategory, AvailableEffect[]>();
    for (const effect of availableEffects) {
      const list = grouped.get(effect.category) ?? [];
      list.push(effect);
      grouped.set(effect.category, list);
    }
    return grouped;
  }, [availableEffects]);

  // Category display order
  const categoryOrder: EffectCategory[] = ['play', 'entrance', 'emphasis', 'exit', 'motion-paths'];

  // Compute step numbers: only on_next/on_click get a number, others get null
  const stepNumbers = useMemo(() => {
    let step = 0;
    return animations.map((resolved) => {
      const trigger = resolved.animation.trigger_type;
      if (trigger === 'on_next' || trigger === 'on_click') {
        step += 1;
        return step;
      }
      return null; // with_previous / after_previous
    });
  }, [animations]);

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
      const newEffect = buildDefaultEffect(newEffectType);
      onUpdateAnimation(animOriginalIndex, { effect: newEffect });
    };
  }

  function makeTriggerTypeChange(animOriginalIndex: number) {
    return (trigger: SpreadAnimation['trigger_type']) => {
      const updates: Partial<SpreadAnimation> = { trigger_type: trigger };
      if (trigger !== 'on_click') {
        updates.click_loop = 0;
      }
      onUpdateAnimation(animOriginalIndex, updates);
    };
  }

  function makeClickLoopChange(animOriginalIndex: number) {
    return (value: number) => {
      onUpdateAnimation(animOriginalIndex, { click_loop: value });
    };
  }

  function makeEffectOptionChange(animOriginalIndex: number, animation: ResolvedAnimation) {
    return (field: string, value: number | string) => {
      const currentEffect = animation.animation.effect;
      onUpdateAnimation(animOriginalIndex, {
        effect: { ...currentEffect, [field]: value },
      });
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
      <div className="flex items-center justify-between border-b px-3 py-2.5">

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
                    {effects.map((effect) => (
                      <button
                        key={effect.id}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => {
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
                    ))}
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
              isHighlighted={selectedItem?.id === resolvedAnim.animation.target.id}
              isDragOver={index === dragOverIndex}
              onClick={() =>
                onExpandChange(index === expandedAnimationIndex ? null : index)
              }
              onDelete={() => onDeleteAnimation(resolvedAnim.originalIndex)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onEffectTypeChange={makeEffectTypeChange(resolvedAnim.originalIndex)}
              onTriggerTypeChange={makeTriggerTypeChange(resolvedAnim.originalIndex)}
              onClickLoopChange={makeClickLoopChange(resolvedAnim.originalIndex)}
              onEffectOptionChange={makeEffectOptionChange(resolvedAnim.originalIndex, resolvedAnim)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
