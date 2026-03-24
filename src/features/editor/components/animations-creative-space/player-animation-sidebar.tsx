// player-animation-sidebar.tsx - Read-only animation list for player mode
// Subscribes to playback store for playing/pending highlights.
// Tracks remaining cLoop from store's replayableItems (no duplicate logic).
// No CRUD, no filter, no expand, no drag-reorder.

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  usePlaybackStore,
  useActiveAnimationOrders,
  usePlayerPhase,
  useMaxActivatedOrder,
  useCurrentStepIndex,
  useReplayableItems,
  usePlayVersion,
} from "@/stores/animation-playback-store";
import type {
  ResolvedAnimation,
  SpreadAnimation,
} from "@/types/animation-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { AnimationListItem } from "./animation-list-item";
import { computeStepNumbers } from "./utils";

interface PlayerAnimationSidebarProps {
  animations: ResolvedAnimation[];
}

// No-op callbacks for disabled AnimationListItem (editor callbacks required by interface)
const noop = () => {};
const noopNumber = (_v: number) => {};
const noopDrag = (_e: React.DragEvent, _i: number) => {};
const noopEffectOption = (_f: string, _v: number | string) => {};
const noopTriggerType = (_t: SpreadAnimation["trigger_type"]) => {};
const noopBoolean = (_v: boolean) => {};

export function PlayerAnimationSidebar({
  animations,
}: PlayerAnimationSidebarProps) {
  // Subscribe to playback store for highlight state
  const activeAnimationOrders = useActiveAnimationOrders();
  const phase = usePlayerPhase();
  const maxActivatedOrder = useMaxActivatedOrder();
  const currentStepIndex = useCurrentStepIndex();
  const steps = usePlaybackStore((s) => s.steps);
  const replayableItems = useReplayableItems();
  const playVersion = usePlayVersion();

  // Classic mode: only show READ_ALONG animations; interactive: show all
  const displayAnimations = useMemo(() => {
    if (playVersion === "classic") {
      return animations.filter(
        (a) => a.animation.effect.type === EFFECT_TYPE.READ_ALONG
      );
    }
    return animations;
  }, [animations, playVersion]);

  // Pending next animation order (blink indicator) — only when awaiting user input
  const [pendingNextOrder, setPendingNextOrder] = useState<number | null>(null);

  useEffect(() => {
    // Only show pending indicator when awaiting user input, not during active playback.
    if (phase !== "awaiting_next" && phase !== "awaiting_click") {
      setPendingNextOrder(null);
      return;
    }
    if (maxActivatedOrder >= 0) {
      // Normal: find next animation order after the last one that played
      const sortedOrders = displayAnimations
        .map((a) => a.animation.order)
        .sort((a, b) => a - b);
      setPendingNextOrder(
        sortedOrders.find((o) => o > maxActivatedOrder) ?? null
      );
    } else {
      // After userBack (maxActivatedOrder reset to -1): pending = first animation of next step
      const nextStep = steps[currentStepIndex + 1];
      setPendingNextOrder(nextStep?.animations[0]?.order ?? null);
    }
  }, [displayAnimations, phase, maxActivatedOrder, currentStepIndex, steps]);

  // Recompute step numbers on the filtered list so numbering is sequential
  const stepNumbers = useMemo(
    () => computeStepNumbers(displayAnimations),
    [displayAnimations]
  );

  // Build remaining cLoop map from store's replayableItems
  // Key: animation order, Value: remaining replays
  const remainingClickLoopMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [, item] of replayableItems) {
      for (const anim of displayAnimations) {
        if (
          anim.animation.target.id === item.itemId &&
          anim.animation.trigger_type === "on_click"
        ) {
          map.set(anim.animation.order, item.remainingReplays);
        }
      }
    }
    return map;
  }, [replayableItems, displayAnimations]);

  // Resolve displayClickLoop for a given animation
  const getDisplayClickLoop = useCallback(
    (anim: ResolvedAnimation): number | undefined => {
      if (anim.animation.trigger_type !== "on_click") return undefined;
      const remaining = remainingClickLoopMap.get(anim.animation.order);
      // Only override when store has tracking data for this animation
      return remaining !== undefined ? remaining : undefined;
    },
    [remainingClickLoopMap]
  );

  return (
    <aside
      role="navigation"
      aria-label="Player animation list"
      className="flex h-full w-[280px] flex-col border-r bg-muted/30"
    >
      {/* Header */}
      <div className="flex items-center justify-center border-b px-3 py-3">
        <div className="h-6"></div>
        <span className="text-sm font-semibold">Animations</span>
      </div>

      {/* Animation list (read-only, filtered by playVersion) */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {displayAnimations.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground text-center">
              No animations on this spread
            </p>
          </div>
        ) : (
          displayAnimations.map((resolvedAnim, index) => (
            <AnimationListItem
              key={`player-${resolvedAnim.originalIndex}-${resolvedAnim.animation.effect.type}`}
              animation={resolvedAnim}
              index={index}
              stepNumber={stepNumbers[index]}
              isExpanded={false}
              isHighlighted={false}
              isDragOver={false}
              isPlaying={activeAnimationOrders.includes(
                resolvedAnim.animation.order
              )}
              isPendingNext={resolvedAnim.animation.order === pendingNextOrder}
              disabled={true}
              displayClickLoop={getDisplayClickLoop(resolvedAnim)}
              onClick={noop}
              onDelete={noop}
              onSelectTarget={noop}
              onDragStart={noopNumber}
              onDragOver={noopDrag}
              onDragEnd={noop}
              onDrop={noopNumber}
              onEffectTypeChange={noopNumber}
              onTriggerTypeChange={noopTriggerType}
              onClickLoopChange={noopNumber}
              onEffectOptionChange={noopEffectOption}
              onMustCompleteChange={noopBoolean}
            />
          ))
        )}
      </div>
    </aside>
  );
}
