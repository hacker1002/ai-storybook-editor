// animation-list-item.tsx - Single animation entry in the sidebar list with compact 4-row layout
// Layout: Row1=trigger icon | Row2=object name + type icon | Row3=effect name + star | Row4=delay/duration/cLoop/eLoop

import { useState } from "react";
import type { ResolvedAnimation, SpreadAnimation } from "@/types/animation-types";
import { STAR_COLOR_MAP } from "@/constants/animation-constants";
import { AnimationSettingsPanel } from "./animation-settings-panel";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Trash2,
  Image,
  Volume2,
  Film,
  Square,
  CircleHelp,
  Star,
  Hand,
  ArrowRight,
  Timer,
  Hourglass,
} from "lucide-react";

interface AnimationListItemProps {
  animation: ResolvedAnimation;
  index: number;
  stepNumber: number | null;
  isExpanded: boolean;
  isHighlighted: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDelete: () => void;
  onSelectTarget: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
  onEffectTypeChange: (newEffectType: number) => void;
  onTriggerTypeChange: (trigger: SpreadAnimation["trigger_type"]) => void;
  onClickLoopChange: (value: number) => void;
  onEffectOptionChange: (field: string, value: number | string) => void;
  onMustCompleteChange: (value: boolean) => void;
  /** Player mode: green highlight when animation is playing */
  isPlaying?: boolean;
  /** Player mode: blink animation for pending next */
  isPendingNext?: boolean;
  /** When true, sidebar item is non-interactive (player mode) */
  disabled?: boolean;
  /** Override cLoop display value (player uses remaining replays instead of DB value) */
  displayClickLoop?: number;
}

function TargetIcon({ icon }: { icon: ResolvedAnimation["targetItemIcon"] }) {
  const cls = "h-3 w-3 text-muted-foreground";
  switch (icon) {
    case "image":
      return <Image className={cls} />;
    case "audio":
      return <Volume2 className={cls} />;
    case "video":
      return <Film className={cls} />;
    case "textbox":
      return (
        <span className="text-[10px] font-bold text-muted-foreground leading-none">
          T
        </span>
      );
    case "shape":
      return <Square className={cls} />;
    case "quiz":
      return <CircleHelp className={cls} />;
  }
}

function TriggerIcon({
  trigger,
}: {
  trigger: SpreadAnimation["trigger_type"];
}) {
  const cls = "h-3.5 w-3.5";
  switch (trigger) {
    case "on_click":
      return <Hand className={cls} />;
    case "on_next":
      return <ArrowRight className={cls} />;
    case "with_previous":
      return <Timer className={cls} />;
    case "after_previous":
      return <Hourglass className={cls} />;
  }
}

function msToSec(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${parseFloat(s.toFixed(1))}s`;
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
  onSelectTarget,
  onDragStart,
  onDragOver,
  onDragEnd: onDragEndProp,
  onDrop,
  onEffectTypeChange,
  onTriggerTypeChange,
  onClickLoopChange,
  onEffectOptionChange,
  onMustCompleteChange,
  isPlaying = false,
  isPendingNext = false,
  disabled = false,
  displayClickLoop,
}: AnimationListItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const anim = animation.animation;
  const starColor = STAR_COLOR_MAP[animation.effectCategory];
  const { effect, trigger_type } = anim;

  function handleDragStart(e: React.DragEvent) {
    if (disabled) return;
    e.dataTransfer.effectAllowed = "move";
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
    if (disabled) return;
    if (e.key === "Enter") onClick();
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!disabled) onDelete();
  }

  function handleClick() {
    if (disabled) return;
    onSelectTarget();
    onClick();
  }

  const dragSourceProps = disabled
    ? {}
    : {
        draggable: true as const,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
      };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      aria-disabled={disabled}
      className={[
        "group rounded select-none outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        disabled ? "pointer-events-none" : "",
        isPendingNext ? "animate-sidebar-blink" : "",
        isDragOver
          ? "border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/30"
          : isPlaying
          ? "border border-green-400 bg-green-50 dark:bg-green-950/20"
          : isExpanded
          ? "border border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : isHighlighted
          ? "border bg-blue-50/30 dark:bg-blue-950/10"
          : "border bg-card",
        isDragging ? "opacity-50" : "",
      ].join(" ")}
    >
      {/* Compact header — 3 rows of info */}
      <div
        {...dragSourceProps}
        className={[
          "relative flex gap-2 px-2 py-1.5",
          disabled ? "" : "cursor-grab active:cursor-grabbing",
        ].join(" ")}
        onClick={handleClick}
      >
        {/* Step number — fixed top-left corner */}
        {stepNumber !== null && (
          <span className="absolute top-1 left-1 z-10 flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[12px] font-semibold text-muted-foreground border border-border">
            {stepNumber}
          </span>
        )}

        {/* Left column: trigger icon centered vertically */}
        <div className="flex items-center justify-center shrink-0 w-6">
          {isPlaying ? (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          ) : (
            <TriggerIcon trigger={trigger_type} />
          )}
        </div>

        {/* Right column: object info + effect info + timing */}
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* Row 1: Object name + type icon */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium truncate flex-1">
              {animation.targetItemName}
            </span>
            <TargetIcon icon={animation.targetItemIcon} />
          </div>

          {/* Row 2: Effect name + star icon */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground truncate flex-1">
              {animation.effectName}
            </span>
            <Star
              className="h-2.5 w-2.5 shrink-0"
              style={{ fill: starColor, stroke: starColor }}
            />
          </div>

          {/* Row 3: Timing values — always show all */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span title="Delay">
              <span className="opacity-60">Delay:</span>
              {msToSec(effect.delay ?? 0)}
            </span>
            <span title="Duration">
              <span className="opacity-60">Dur:</span>
              {msToSec(effect.duration ?? 0)}
            </span>
            <span title="Click Loop">
              <span className="opacity-60">cLoop:</span>
              {displayClickLoop ?? anim.click_loop ?? 0}
            </span>
            <span title="Effect Loop">
              <span className="opacity-60">eLoop:</span>
              {effect.loop ?? 0}
            </span>
          </div>
        </div>

        {/* Delete button — visible on hover */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start mt-0.5"
          onClick={handleDeleteClick}
          tabIndex={-1}
          aria-label="Delete animation"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Expanded settings panel */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <AnimationSettingsPanel
            animation={animation}
            onEffectTypeChange={onEffectTypeChange}
            onTriggerTypeChange={onTriggerTypeChange}
            onClickLoopChange={onClickLoopChange}
            onEffectOptionChange={onEffectOptionChange}
            onMustCompleteChange={onMustCompleteChange}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
