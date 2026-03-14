// player-animation-sidebar.tsx - Read-only animation list for player mode
// Subscribes to playback store for playing/pending highlights.
// Tracks remaining cLoop from store's replayableItems (no duplicate logic).
// No CRUD, no filter, no expand, no drag-reorder.

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useActiveAnimationOrders,
  usePlayerPhase,
  useMaxActivatedOrder,
  useReplayableItems,
} from "@/stores/animation-playback-store";
import type { ResolvedAnimation } from "@/types/animation-types";
import { AnimationListItem } from "./animation-list-item";

interface PlayerAnimationSidebarProps {
  animations: ResolvedAnimation[];
}

// No-op callbacks for disabled AnimationListItem (editor callbacks required by interface)
const noop = () => {};
const noopIndex = () => {};
const noopDrag = (_e: React.DragEvent, _i: number) => {};
const noopStr = (_f: string, _v: number | string) => {};

export function PlayerAnimationSidebar({
  animations,
}: PlayerAnimationSidebarProps) {
  // Subscribe to playback store for highlight state
  const activeAnimationOrders = useActiveAnimationOrders();
  const phase = usePlayerPhase();
  const maxActivatedOrder = useMaxActivatedOrder();
  const replayableItems = useReplayableItems();

  // Pending next animation order (blink indicator)
  const [pendingNextOrder, setPendingNextOrder] = useState<number | null>(null);

  useEffect(() => {
    if (phase === "idle" || phase === "complete") {
      setPendingNextOrder(null);
      return;
    }
    // Still playing, don't update pending
    if (activeAnimationOrders.length > 0) return;
    if (maxActivatedOrder >= 0) {
      const sortedOrders = animations
        .map((a) => a.animation.order)
        .sort((a, b) => a - b);
      setPendingNextOrder(
        sortedOrders.find((o) => o > maxActivatedOrder) ?? null
      );
    }
  }, [activeAnimationOrders, animations, phase, maxActivatedOrder]);

  // Step numbers: only on_next/on_click get a number
  const stepNumbers = useMemo(() => {
    let step = 0;
    return animations.map((resolved) => {
      const trigger = resolved.animation.trigger_type;
      if (trigger === "on_next" || trigger === "on_click") {
        step += 1;
        return step;
      }
      return null;
    });
  }, [animations]);

  // Build remaining cLoop map from store's replayableItems
  // Key: animation order, Value: remaining replays
  const remainingClickLoopMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [, item] of replayableItems) {
      // Find animations matching this replayable item's target
      for (const anim of animations) {
        if (
          anim.animation.target.id === item.itemId &&
          anim.animation.trigger_type === "on_click"
        ) {
          map.set(anim.animation.order, item.remainingReplays);
        }
      }
    }
    return map;
  }, [replayableItems, animations]);

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
        <span className="text-sm font-semibold">Animations</span>
      </div>

      {/* Animation list (read-only) */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {animations.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground text-center">
              No animations on this spread
            </p>
          </div>
        ) : (
          animations.map((resolvedAnim, index) => (
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
              onDragStart={noopIndex}
              onDragOver={noopDrag}
              onDragEnd={noop}
              onDrop={noopIndex}
              onEffectTypeChange={noopIndex}
              onTriggerTypeChange={noop as any}
              onClickLoopChange={noopIndex}
              onEffectOptionChange={noopStr}
              onMustCompleteChange={noop as any}
            />
          ))
        )}
      </div>
    </aside>
  );
}
