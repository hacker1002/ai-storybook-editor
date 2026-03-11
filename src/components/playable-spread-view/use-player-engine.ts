// use-player-engine.ts - State machine hook for semi-auto playback via useReducer

import { useReducer } from "react";
import type { PlayerState, PlayerAction, AnimationStep } from "./types";

// === Initial State ===
const initialState: PlayerState = {
  phase: "idle",
  steps: [],
  currentStepIndex: -1,
  pendingClickTargetId: null,
  replayableItems: new Map(),
};

// === Helper Functions (exported for testing) ===

/** Find the next step with triggerType='on_next' starting from `fromIndex` */
export function findNextOnNextStep(
  steps: AnimationStep[],
  fromIndex: number
): number {
  for (let i = fromIndex; i < steps.length; i++) {
    if (steps[i].triggerType === "on_next") return i;
  }
  return -1;
}

/** Find the previous step with triggerType='on_next' searching backward from `fromIndex - 1` */
export function findPrevOnNextStep(
  steps: AnimationStep[],
  fromIndex: number
): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (steps[i].triggerType === "on_next") return i;
  }
  return -1;
}

/** Find on_click step matching targetId within consecutive on_click chain after afterIndex */
export function findOnClickStepForTarget(
  steps: AnimationStep[],
  afterIndex: number,
  targetId: string
): number {
  for (let i = afterIndex + 1; i < steps.length; i++) {
    if (steps[i].triggerType !== "on_click") break; // stop at non-on_click
    if (steps[i].targetId === targetId) return i;
  }
  return -1;
}

/** Check if an item has remaining click loop replays */
export function isReplayableClick(
  replayableItems: Map<string, { remainingReplays: number }>,
  itemId: string
): boolean {
  const entry = replayableItems.get(itemId);
  return !!entry && entry.remainingReplays > 0;
}

// === Reducer ===
export function playerReducer(
  state: PlayerState,
  action: PlayerAction
): PlayerState {
  // console.log("playerReducer: ", action, state);
  switch (action.type) {
    // ── RESET ──────────────────────────────────────────────────
    case "RESET": {
      const { steps } = action;
      const replayableItems = new Map();

      if (steps.length === 0) {
        return {
          phase: "idle",
          steps: [],
          currentStepIndex: -1,
          pendingClickTargetId: null,
          replayableItems,
        };
      }
      // Auto step[0] → start playing immediately
      if (steps[0].triggerType === "auto") {
        return {
          phase: "playing",
          steps,
          currentStepIndex: 0,
          pendingClickTargetId: null,
          replayableItems,
        };
      }
      // On-click step[0] → wait for user to click the target item
      if (steps[0].triggerType === "on_click") {
        return {
          phase: "awaiting_click",
          steps,
          currentStepIndex: -1,
          pendingClickTargetId: steps[0].targetId ?? null,
          replayableItems,
        };
      }
      // on_next → idle, wait for user to press Next
      return {
        phase: "idle",
        steps,
        currentStepIndex: -1,
        pendingClickTargetId: null,
        replayableItems,
      };
    }

    // ── USER_NEXT ──────────────────────────────────────────────
    case "USER_NEXT": {
      if (state.phase === "playing" || state.phase === "complete") return state;

      // From idle, awaiting_next, or awaiting_click → find next on_next step
      const nextIdx = findNextOnNextStep(
        state.steps,
        state.currentStepIndex + 1
      );
      if (nextIdx >= 0) {
        return {
          ...state,
          phase: "playing",
          currentStepIndex: nextIdx,
          pendingClickTargetId: null,
        };
      }
      // No on_next step found — if currently awaiting_click, stay (user must click target)
      if (state.phase === "awaiting_click") return state;
      return { ...state, phase: "complete", pendingClickTargetId: null };
    }

    // ── USER_CLICK ─────────────────────────────────────────────
    case "USER_CLICK": {
      if (state.phase !== "awaiting_click") return state;

      const clickIdx = findOnClickStepForTarget(
        state.steps,
        state.currentStepIndex,
        action.itemId
      );
      if (clickIdx >= 0) {
        return {
          ...state,
          phase: "playing",
          currentStepIndex: clickIdx,
          pendingClickTargetId: null,
        };
      }
      return state; // wrong target, ignore
    }

    // ── STEP_COMPLETE ──────────────────────────────────────────
    case "STEP_COMPLETE": {
      if (state.phase !== "playing") return state;

      const completedStep = state.steps[state.currentStepIndex];
      const newReplayableItems = new Map(state.replayableItems);

      // Register click_loop if applicable
      if (
        completedStep?.triggerType === "on_click" &&
        completedStep.targetId &&
        (completedStep.clickLoop ?? 0) > 0
      ) {
        newReplayableItems.set(completedStep.targetId, {
          itemId: completedStep.targetId,
          stepIndex: state.currentStepIndex,
          remainingReplays: completedStep.clickLoop!,
        });
      }

      // Determine next step
      const nextIdx = state.currentStepIndex + 1;
      if (nextIdx >= state.steps.length) {
        return {
          ...state,
          phase: "complete",
          replayableItems: newReplayableItems,
        };
      }

      const nextStep = state.steps[nextIdx];
      if (nextStep.triggerType === "auto") {
        return {
          ...state,
          phase: "playing",
          currentStepIndex: nextIdx,
          replayableItems: newReplayableItems,
        };
      }
      if (nextStep.triggerType === "on_click") {
        return {
          ...state,
          phase: "awaiting_click",
          pendingClickTargetId: nextStep.targetId ?? null,
          replayableItems: newReplayableItems,
        };
      }
      // on_next
      return {
        ...state,
        phase: "awaiting_next",
        pendingClickTargetId: null,
        replayableItems: newReplayableItems,
      };
    }

    // ── USER_BACK ──────────────────────────────────────────────
    case "USER_BACK": {
      if (state.currentStepIndex <= 0) return state;

      const prevIdx = findPrevOnNextStep(state.steps, state.currentStepIndex);
      if (prevIdx >= 0) {
        return {
          ...state,
          phase: "playing",
          currentStepIndex: prevIdx,
          pendingClickTargetId: null,
        };
      }
      return state; // no previous on_next step found
    }

    // ── CLICK_LOOP_REPLAY ──────────────────────────────────────
    case "CLICK_LOOP_REPLAY": {
      // Ignore during active playback
      if (state.phase === "playing") return state;

      const replayable = state.replayableItems.get(action.itemId);
      if (!replayable || replayable.remainingReplays <= 0) return state;

      // Only decrement remaining count — PlayerCanvas self-handles GSAP replay
      const newReplayableItems = new Map(state.replayableItems);
      newReplayableItems.set(action.itemId, {
        ...replayable,
        remainingReplays: replayable.remainingReplays - 1,
      });

      return { ...state, replayableItems: newReplayableItems };
    }

    default:
      return state;
  }
}

// === Hook ===
export function usePlayerEngine() {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  return { state, dispatch };
}
