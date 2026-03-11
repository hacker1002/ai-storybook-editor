// animation-list-item.tsx - Single animation entry in the sidebar list with drag-to-reorder support

import { useState } from 'react';
import type { ResolvedAnimation, SpreadAnimation } from './animation-types';
import { STAR_COLOR_MAP, TRIGGER_TYPE_LABELS } from './animation-constants';
import { AnimationSettingsPanel } from './animation-settings-panel';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Trash2, Image, Volume2, Film, Square, Star } from 'lucide-react';

interface AnimationListItemProps {
  animation: ResolvedAnimation;
  index: number;
  /** Step number for on_next/on_click triggers, null for with_previous/after_previous */
  stepNumber: number | null;
  isExpanded: boolean;
  isHighlighted: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
  onEffectTypeChange: (newEffectType: number) => void;
  onTriggerTypeChange: (trigger: SpreadAnimation['trigger_type']) => void;
  onClickLoopChange: (value: number) => void;
  onEffectOptionChange: (field: string, value: number | string) => void;
}

/** Renders the appropriate icon for the animation's target item type */
function TargetIcon({ icon }: { icon: ResolvedAnimation['targetItemIcon'] }) {
  const cls = 'h-3.5 w-3.5 text-muted-foreground';
  switch (icon) {
    case 'image': return <Image className={cls} />;
    case 'audio': return <Volume2 className={cls} />;
    case 'video': return <Film className={cls} />;
    case 'text':  return <span className="text-xs font-bold text-muted-foreground">T</span>;
    case 'shape': return <Square className={cls} />;
  }
}

/** Format ms value to seconds display (e.g., 500 → "0.5s", 1200 → "1.2s") */
function msToSec(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${parseFloat(s.toFixed(1))}s`;
}

/** Builds a compact summary line from non-default animation option values */
function buildSummaryParts(anim: SpreadAnimation): string[] {
  const parts: string[] = [];
  const { effect } = anim;
  if (effect.loop !== undefined && effect.loop > 0) parts.push(`Loop: ${effect.loop}`);
  if (effect.delay !== undefined && effect.delay > 0) parts.push(`Delay: ${msToSec(effect.delay)}`);
  if (effect.duration !== undefined && effect.duration > 0) parts.push(`Duration: ${msToSec(effect.duration)}`);
  return parts;
}

export function AnimationListItem({
  animation,
  index,
  stepNumber,
  isExpanded,
  isHighlighted,
  isDragOver,
  onClick,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd: onDragEndProp,
  onDrop,
  onEffectTypeChange,
  onTriggerTypeChange,
  onClickLoopChange,
  onEffectOptionChange,
}: AnimationListItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const anim = animation.animation;
  const starColor = STAR_COLOR_MAP[animation.effectCategory];
  const triggerLabel = TRIGGER_TYPE_LABELS[anim.trigger_type] ?? anim.trigger_type;
  const summaryParts = buildSummaryParts(anim);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    onDragStart(index);
  }

  function handleDragEnd() {
    setIsDragging(false);
    onDragEndProp();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    onDragOver(e, index);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    onDrop(index);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      onClick();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      onDelete();
    }
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete();
  }

  // Shared drag props for header & summary rows (drag source zones)
  const dragSourceProps = {
    draggable: true as const,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      className={[
        'group rounded select-none outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        isDragOver
          ? 'border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/30'
          : isHighlighted
            ? 'border bg-blue-50 dark:bg-blue-950/20'
            : 'border bg-card',
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Header row — drag source + click to toggle expand/collapse */}
      <div
        {...dragSourceProps}
        className="flex items-center gap-2 px-2.5 py-2 cursor-grab active:cursor-grabbing"
        onClick={onClick}
      >
        {/* Step number (on_next/on_click) or sub-indicator (with/after previous) */}
        <span className="text-xs font-mono w-5 text-muted-foreground shrink-0 text-center">
          {stepNumber !== null ? stepNumber : ''}
        </span>

        {/* Effect category star */}
        <Star
          className="h-3 w-3 shrink-0"
          style={{ fill: starColor, stroke: starColor }}
        />

        {/* Animation display title */}
        <span className="text-sm truncate flex-1">{animation.displayTitle}</span>

        {/* Target item type icon */}
        <TargetIcon icon={animation.targetItemIcon} />

        {/* Delete button — visible on hover */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={handleDeleteClick}
          tabIndex={-1}
          aria-label="Delete animation"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Summary row (collapsed state) — drag source + click to expand */}
      {!isExpanded && (
        <div
          {...dragSourceProps}
          className="px-2.5 pb-1.5 text-xs text-muted-foreground cursor-grab active:cursor-grabbing"
          onClick={onClick}
        >
          <span>Trigger: {triggerLabel}</span>
          {summaryParts.length > 0 && (
            <span className="ml-2">{summaryParts.join(' · ')}</span>
          )}
        </div>
      )}

      {/* Expanded settings panel — clicks here should NOT toggle collapse */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <AnimationSettingsPanel
            animation={animation}
            onEffectTypeChange={onEffectTypeChange}
            onTriggerTypeChange={onTriggerTypeChange}
            onClickLoopChange={onClickLoopChange}
            onEffectOptionChange={onEffectOptionChange}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
