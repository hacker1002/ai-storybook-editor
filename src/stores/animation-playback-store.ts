// animation-playback-store.ts - Zustand store for playback state machine (migrated from usePlayerEngine/playerReducer)

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { AnimationStep, PlayerPhase, PlayMode, PlayVersion, ReplayableItem } from '@/types/playable-types';
import {
  findNextOnNextStep,
  findPrevOnNextStep,
  findOnClickStepForTarget,
} from '@/features/editor/components/playable-spread-view/player-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'AnimationPlaybackStore');

// === State & Actions interfaces ===

interface PlaybackState {
  playMode: PlayMode;
  playVersion: PlayVersion;
  isPlaying: boolean;
  volume: number;        // 0..100
  isMuted: boolean;
  phase: PlayerPhase;
  steps: AnimationStep[];
  currentStepIndex: number;  // -1 = not started
  pendingClickTargetId: string | null;
  replayableItems: Map<string, ReplayableItem>;
  activeAnimationOrders: number[];
  maxActivatedOrder: number; // highest order ever passed to addActiveAnimationOrder (reset per phase)
}

interface PlaybackActions {
  play: () => void;
  pause: () => void;
  setPlayMode: (mode: PlayMode) => void;
  setPlayVersion: (version: PlayVersion) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  reset: (steps: AnimationStep[]) => void;
  userNext: () => void;
  userBack: () => void;
  userClick: (itemId: string) => void;
  stepComplete: () => void;
  cancelAndNext: () => void;
  clickLoopReplay: (itemId: string) => { shouldReplay: boolean; step?: AnimationStep };
  resetStore: () => void;
  setActiveAnimationOrders: (orders: number[]) => void;
  addActiveAnimationOrder: (order: number) => void;
  removeActiveAnimationOrder: (order: number) => void;
}

// === Initial state ===

const INITIAL_STATE: PlaybackState = {
  playMode: 'off',
  playVersion: 'classic',
  isPlaying: true,      // auto-start when mount
  volume: 100,
  isMuted: false,
  phase: 'idle',
  steps: [],
  currentStepIndex: -1,
  pendingClickTargetId: null,
  replayableItems: new Map(),
  activeAnimationOrders: [],
  maxActivatedOrder: -1,
};

// === Store creation ===

export const usePlaybackStore = create<PlaybackState & PlaybackActions>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...INITIAL_STATE,

      // ── Playback Controls ────────────────────────────────────────────────

      play: () => {
        log.info('play', 'playing');
        set({ isPlaying: true });
      },

      pause: () => {
        log.info('pause', 'paused');
        set({ isPlaying: false });
      },

      setPlayMode: (mode) => {
        const prev = get().playMode;
        log.info('setPlayMode', 'transition', { prev, next: mode });
        set({ playMode: mode });
      },

      setPlayVersion: (version) => {
        const prev = get().playVersion;
        log.info('setPlayVersion', 'transition', { prev, next: version });
        set({ playVersion: version });
      },

      setVolume: (v) => {
        const clamped = Math.min(100, Math.max(0, v));
        set({ volume: clamped, ...(clamped > 0 ? { isMuted: false } : {}) });
      },

      toggleMute: () => {
        const { isMuted, volume } = get();
        log.info('toggleMute', 'transition', { prev: isMuted, volume });
        if (isMuted) {
          // Unmuting — if volume was 0, restore to 100
          set({ isMuted: false, ...(volume === 0 ? { volume: 100 } : {}) });
        } else {
          set({ isMuted: true });
        }
      },

      // ── RESET — mirrors playerReducer case 'RESET' ───────────────────────

      reset: (steps) => {
        log.info('reset', 'start', { stepCount: steps.length, firstTrigger: steps[0]?.triggerType });
        const replayableItems = new Map<string, ReplayableItem>();

        if (steps.length === 0) {
          set({
            phase: 'idle',
            steps: [],
            currentStepIndex: -1,
            pendingClickTargetId: null,
            replayableItems,
            activeAnimationOrders: [],
            maxActivatedOrder: -1,
          });
          return;
        }

        // Auto step[0] → start playing immediately
        if (steps[0].triggerType === 'auto') {
          log.debug('reset', 'phase → playing (auto trigger)', { stepCount: steps.length });
          set({
            phase: 'playing',
            steps,
            currentStepIndex: 0,
            pendingClickTargetId: null,
            replayableItems,
            activeAnimationOrders: [],
            maxActivatedOrder: -1,
          });
          return;
        }

        // On-click step[0] → wait for user to click the target item
        if (steps[0].triggerType === 'on_click') {
          log.debug('reset', 'phase → awaiting_click', { targetId: steps[0].targetId });
          set({
            phase: 'awaiting_click',
            steps,
            currentStepIndex: -1,
            pendingClickTargetId: steps[0].targetId ?? null,
            replayableItems,
            activeAnimationOrders: [],
            maxActivatedOrder: -1,
          });
          return;
        }

        // on_next → idle, wait for user to press Next
        log.debug('reset', 'phase → idle (on_next trigger)');
        set({
          phase: 'idle',
          steps,
          currentStepIndex: -1,
          pendingClickTargetId: null,
          replayableItems,
          activeAnimationOrders: [],
          maxActivatedOrder: -1,
        });
      },

      // ── USER_NEXT — mirrors playerReducer case 'USER_NEXT' ───────────────

      userNext: () => {
        const { phase, steps, currentStepIndex } = get();
        log.info('userNext', 'action', { phase, currentStepIndex });
        if (phase === 'playing' || phase === 'complete') return;

        // From idle, awaiting_next, or awaiting_click → find next on_next step
        const nextIdx = findNextOnNextStep(steps, currentStepIndex + 1);
        if (nextIdx >= 0) {
          set({ phase: 'playing', currentStepIndex: nextIdx, pendingClickTargetId: null, maxActivatedOrder: -1 });
          return;
        }

        // No on_next step found — if currently awaiting_click, stay
        if (phase === 'awaiting_click') return;
        set({ phase: 'complete', pendingClickTargetId: null });
      },

      // ── USER_BACK — mirrors playerReducer case 'USER_BACK' ───────────────

      userBack: () => {
        const { currentStepIndex, steps } = get();
        log.info('userBack', 'action', { currentStepIndex });
        if (currentStepIndex <= 0) return;

        const prevIdx = findPrevOnNextStep(steps, currentStepIndex);
        if (prevIdx >= 0) {
          set({ phase: 'playing', currentStepIndex: prevIdx, pendingClickTargetId: null, maxActivatedOrder: -1 });
        }
        // No previous on_next step found — stay
      },

      // ── USER_CLICK — mirrors playerReducer case 'USER_CLICK' ─────────────

      userClick: (itemId) => {
        const { phase, steps, currentStepIndex } = get();
        log.info('userClick', 'action', { itemId, phase });
        if (phase !== 'awaiting_click') return;

        const clickIdx = findOnClickStepForTarget(steps, currentStepIndex, itemId);
        if (clickIdx >= 0) {
          set({ phase: 'playing', currentStepIndex: clickIdx, pendingClickTargetId: null, maxActivatedOrder: -1 });
        }
        // Wrong target — ignore
      },

      // ── STEP_COMPLETE — mirrors playerReducer case 'STEP_COMPLETE' ────────

      stepComplete: () => {
        const { phase, steps, currentStepIndex, replayableItems } = get();
        log.info('stepComplete', 'action', { phase, currentStepIndex });
        if (phase !== 'playing') return;

        const completedStep = steps[currentStepIndex];
        const newReplayableItems = new Map(replayableItems);

        // Register click_loop if applicable
        if (
          completedStep?.triggerType === 'on_click' &&
          completedStep.targetId &&
          (completedStep.clickLoop ?? 0) > 0
        ) {
          newReplayableItems.set(completedStep.targetId, {
            itemId: completedStep.targetId,
            stepIndex: currentStepIndex,
            remainingReplays: completedStep.clickLoop!,
          });
        }

        // Determine next step
        const nextIdx = currentStepIndex + 1;
        if (nextIdx >= steps.length) {
          log.debug('stepComplete', 'phase → complete');
          set({
            phase: 'complete',
            replayableItems: newReplayableItems,
          });
          return;
        }

        const nextStep = steps[nextIdx];
        if (nextStep.triggerType === 'auto') {
          set({
            phase: 'playing',
            currentStepIndex: nextIdx,
            replayableItems: newReplayableItems,
            maxActivatedOrder: -1,
          });
          return;
        }
        if (nextStep.triggerType === 'on_click') {
          log.debug('stepComplete', 'phase → awaiting_click', { targetId: nextStep.targetId });
          set({
            phase: 'awaiting_click',
            pendingClickTargetId: nextStep.targetId ?? null,
            replayableItems: newReplayableItems,
          });
          return;
        }
        // on_next
        log.debug('stepComplete', 'phase → awaiting_next');
        set({
          phase: 'awaiting_next',
          pendingClickTargetId: null,
          replayableItems: newReplayableItems,
        });
      },

      // ── CANCEL_AND_NEXT — advance without registering click_loop ──

      cancelAndNext: () => {
        const { phase, steps, currentStepIndex } = get();
        log.info('cancelAndNext', 'action', { phase, currentStepIndex });
        if (phase !== 'playing') return;

        // Do NOT register click_loop replayable items — just advance
        const nextIdx = currentStepIndex + 1;
        if (nextIdx >= steps.length) {
          set({ phase: 'complete' });
          return;
        }

        const nextStep = steps[nextIdx];
        if (nextStep.triggerType === 'auto') {
          set({ phase: 'playing', currentStepIndex: nextIdx, maxActivatedOrder: -1 });
          return;
        }
        if (nextStep.triggerType === 'on_click') {
          set({ phase: 'awaiting_click', pendingClickTargetId: nextStep.targetId ?? null });
          return;
        }
        // on_next
        set({ phase: 'awaiting_next', pendingClickTargetId: null });
      },

      // ── CLICK_LOOP_REPLAY — modified from playerReducer case 'CLICK_LOOP_REPLAY' ──
      // Returns { shouldReplay, step? } instead of updating state only

      clickLoopReplay: (itemId) => {
        const { phase, replayableItems, steps } = get();
        log.info('clickLoopReplay', 'action', { itemId, phase });

        // Ignore during active playback
        if (phase === 'playing') return { shouldReplay: false };

        const replayable = replayableItems.get(itemId);
        if (!replayable || replayable.remainingReplays <= 0) {
          log.debug('clickLoopReplay', 'no replays remaining', { itemId });
          return { shouldReplay: false };
        }

        // Decrement remaining count and update state
        const newReplayableItems = new Map(replayableItems);
        newReplayableItems.set(itemId, {
          ...replayable,
          remainingReplays: replayable.remainingReplays - 1,
        });
        set({ replayableItems: newReplayableItems });

        return { shouldReplay: true, step: steps[replayable.stepIndex] };
      },

      // ── RESET_STORE — full reset with non-playing state ───────────────────

      resetStore: () => {
        log.info('resetStore', 'full reset');
        set({
          ...INITIAL_STATE,
          isPlaying: false,
          replayableItems: new Map(),
          activeAnimationOrders: [],
          maxActivatedOrder: -1,
        });
      },

      // ── ACTIVE / PENDING ANIMATION ORDERS — for sidebar highlight ─────────

      setActiveAnimationOrders: (orders) => set({
        activeAnimationOrders: orders,
        ...(orders.length === 0 ? {} : { maxActivatedOrder: Math.max(...orders) }),
      }),

      addActiveAnimationOrder: (order) => {
        const current = get().activeAnimationOrders;
        if (current.includes(order)) return;
        set({
          activeAnimationOrders: [...current, order],
          maxActivatedOrder: Math.max(get().maxActivatedOrder, order),
        });
      },

      removeActiveAnimationOrder: (order) => {
        const current = get().activeAnimationOrders;
        const filtered = current.filter((o) => o !== order);
        if (filtered.length !== current.length) {
          set({ activeAnimationOrders: filtered });
        }
      },
    })),
    { name: 'playback-store' }
  )
);

// === Selectors (fine-grained for optimized re-renders) ===

export const usePlayMode = () => usePlaybackStore((s) => s.playMode);
export const usePlayVersion = () => usePlaybackStore((s) => s.playVersion);
export const useIsPlaying = () => usePlaybackStore((s) => s.isPlaying);
export const useVolume = () => usePlaybackStore((s) => s.volume);
export const useIsMuted = () => usePlaybackStore((s) => s.isMuted);
export const usePlayerPhase = () => usePlaybackStore((s) => s.phase);
export const useCurrentStepIndex = () => usePlaybackStore((s) => s.currentStepIndex);
export const usePendingClickTargetId = () => usePlaybackStore((s) => s.pendingClickTargetId);
export const useReplayableItems = () => usePlaybackStore((s) => s.replayableItems);

export const useCurrentStep = () =>
  usePlaybackStore((s) =>
    s.currentStepIndex >= 0 ? s.steps[s.currentStepIndex] ?? null : null
  );

export const useActiveAnimationOrders = () => usePlaybackStore((s) => s.activeAnimationOrders);
export const useMaxActivatedOrder = () => usePlaybackStore((s) => s.maxActivatedOrder);

export const usePlaybackActions = () =>
  usePlaybackStore(
    useShallow((s) => ({
      play: s.play,
      pause: s.pause,
      setPlayMode: s.setPlayMode,
      setPlayVersion: s.setPlayVersion,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      reset: s.reset,
      userNext: s.userNext,
      userBack: s.userBack,
      userClick: s.userClick,
      stepComplete: s.stepComplete,
      cancelAndNext: s.cancelAndNext,
      clickLoopReplay: s.clickLoopReplay,
      resetStore: s.resetStore,
    }))
  );
