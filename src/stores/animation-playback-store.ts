// animation-playback-store.ts - Zustand store for playback state machine (migrated from usePlayerEngine/playerReducer)

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import type { AnimationStep, PlayerPhase, PlayMode, PlayEdition, ReplayableItem, SpreadHistoryEntry } from '@/types/playable-types';
import type { Section } from '@/types/illustration-types';
import {
  findNextOnNextStep,
  findOnClickStepForTarget,
} from '@/features/editor/components/playable-spread-view/player-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'AnimationPlaybackStore');

// === State & Actions interfaces ===

interface PlaybackState {
  playMode: PlayMode;
  playEdition: PlayEdition;
  isPlaying: boolean;
  volume: number;        // 0..100
  isMuted: boolean;
  phase: PlayerPhase;
  steps: AnimationStep[];
  currentStepIndex: number;  // -1 = not started
  pendingClickTargetId: string | null;
  replayableItems: Map<string, ReplayableItem>;
  /** Live remaining-play counter per animation order (eLoop sidebar display).
   *  Seeded only for finite loops > 1; absent entry = render static effect.loop. */
  effectLoopRemaining: Map<number, number>;
  activeAnimationOrders: number[];
  maxActivatedOrder: number; // highest order ever passed to addActiveAnimationOrder (reset per phase)
  narrationLanguage: string; // language code for narration audio (e.g. 'en_US')
  quizLanguage: string;      // language code for quiz content (e.g. 'en_US')
  spreadHistories: SpreadHistoryEntry[]; // breadcrumb trail for branching navigation
  currentSection: Section | null;        // active section in current player context
}

interface PlaybackActions {
  play: () => void;
  pause: () => void;
  setPlayMode: (mode: PlayMode) => void;
  setPlayEdition: (edition: PlayEdition) => void;
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
  setNarrationLanguage: (code: string) => void;
  setQuizLanguage: (code: string) => void;
  pushSpreadHistory: (spreadId: string, section: Section | null) => void;
  popSpreadHistory: () => SpreadHistoryEntry | null;
  clearSpreadHistory: () => void;
  setCurrentSection: (section: Section | null) => void;
  setActiveAnimationOrders: (orders: number[]) => void;
  addActiveAnimationOrder: (order: number) => void;
  removeActiveAnimationOrder: (order: number) => void;
  setEffectLoopRemaining: (order: number, count: number) => void;
  decrementEffectLoopRemaining: (order: number) => void;
  /** Clear single entry when `order` provided, or wipe map otherwise. */
  clearEffectLoopRemaining: (order?: number) => void;
}

// === Initial state ===

const INITIAL_STATE: PlaybackState = {
  playMode: 'off',
  playEdition: 'classic',
  isPlaying: true,      // auto-start when mount
  volume: 100,
  isMuted: false,
  phase: 'idle',
  steps: [],
  currentStepIndex: -1,
  pendingClickTargetId: null,
  replayableItems: new Map(),
  effectLoopRemaining: new Map(),
  activeAnimationOrders: [],
  maxActivatedOrder: -1,
  narrationLanguage: 'en_US',
  quizLanguage: 'en_US',
  spreadHistories: [],
  currentSection: null,
};

// === Store creation ===

export const usePlaybackStore = create<PlaybackState & PlaybackActions>()(
  devtools(
    subscribeWithSelector(
      persist((set, get) => ({
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

      setPlayEdition: (version) => {
        const prev = get().playEdition;
        log.info('setPlayEdition', 'transition', { prev, next: version });
        set({ playEdition: version });
      },

      setNarrationLanguage: (code) => {
        const prev = get().narrationLanguage;
        log.info('setNarrationLanguage', 'transition', { prev, next: code });
        set({ narrationLanguage: code });
      },

      setQuizLanguage: (code) => {
        const prev = get().quizLanguage;
        log.info('setQuizLanguage', 'transition', { prev, next: code });
        set({ quizLanguage: code });
      },

      pushSpreadHistory: (spreadId, section) => {
        const current = get().spreadHistories;
        log.debug('pushSpreadHistory', 'push', { spreadId, sectionId: section?.id ?? null, newLength: current.length + 1 });
        set({ spreadHistories: [...current, { spreadId, section }] });
      },

      popSpreadHistory: () => {
        const { spreadHistories } = get();
        if (spreadHistories.length <= 1) {
          log.debug('popSpreadHistory', 'at root, nothing to pop');
          return null;
        }
        const newHistories = spreadHistories.slice(0, -1);
        const newTop = newHistories[newHistories.length - 1];
        log.debug('popSpreadHistory', 'pop', { newLength: newHistories.length, newTopId: newTop.spreadId });
        set({ spreadHistories: newHistories, currentSection: newTop.section });
        return newTop;
      },

      clearSpreadHistory: () => {
        log.debug('clearSpreadHistory', 'clear');
        set({ spreadHistories: [], currentSection: null });
      },

      setCurrentSection: (section) => {
        log.debug('setCurrentSection', 'set', { sectionId: section?.id ?? null });
        set({ currentSection: section });
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
            effectLoopRemaining: new Map(),
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
            effectLoopRemaining: new Map(),
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
            effectLoopRemaining: new Map(),
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
          effectLoopRemaining: new Map(),
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

      // ── USER_BACK — revert current step, don't auto-play ─────────────────
      // Decrements currentStepIndex so the next userNext() replays the reverted step.
      // Visual revert is handled by the component (reApplyInitialStates) before calling this.

      userBack: () => {
        const { currentStepIndex, steps } = get();
        log.info('userBack', 'action', { currentStepIndex });
        if (currentStepIndex < 0) return;

        const newIdx = currentStepIndex - 1;
        // The step that will replay is newIdx + 1 (the one we just reverted).
        // If that step is 'auto' (after_previous/with_previous), it must auto-play
        // because it can't be triggered by user input.
        const replayStep = steps[newIdx + 1];
        const shouldAutoPlay = replayStep?.triggerType === 'auto';

        set({
          phase: shouldAutoPlay ? 'playing' : 'awaiting_next',
          currentStepIndex: newIdx,
          pendingClickTargetId: null,
          maxActivatedOrder: -1,
        });
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
        log.info('resetStore', 'full reset (preserving user preferences)');
        const { volume, isMuted, narrationLanguage, quizLanguage } = get();
        set({
          ...INITIAL_STATE,
          isPlaying: false,
          volume,
          isMuted,
          narrationLanguage,
          quizLanguage,
          replayableItems: new Map(),
          effectLoopRemaining: new Map(),
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

      setEffectLoopRemaining: (order, count) => {
        const next = new Map(get().effectLoopRemaining);
        next.set(order, count);
        set({ effectLoopRemaining: next });
      },

      decrementEffectLoopRemaining: (order) => {
        const current = get().effectLoopRemaining;
        const v = current.get(order);
        if (v === undefined) return;
        const next = new Map(current);
        next.set(order, Math.max(0, v - 1));
        set({ effectLoopRemaining: next });
      },

      clearEffectLoopRemaining: (order) => {
        if (order === undefined) {
          if (get().effectLoopRemaining.size === 0) return;
          set({ effectLoopRemaining: new Map() });
          return;
        }
        const current = get().effectLoopRemaining;
        if (!current.has(order)) return;
        const next = new Map(current);
        next.delete(order);
        set({ effectLoopRemaining: next });
      },
    }), {
        name: 'playback-preferences',
        partialize: (state) => ({
          volume: state.volume,
          isMuted: state.isMuted,
          narrationLanguage: state.narrationLanguage,
          quizLanguage: state.quizLanguage,
        }),
      })),
    { name: 'playback-store' }
  )
);

// === Selectors (fine-grained for optimized re-renders) ===

export const usePlayMode = () => usePlaybackStore((s) => s.playMode);
export const usePlayEdition = () => usePlaybackStore((s) => s.playEdition);
export const useIsPlaying = () => usePlaybackStore((s) => s.isPlaying);
export const useVolume = () => usePlaybackStore((s) => s.volume);
export const useIsMuted = () => usePlaybackStore((s) => s.isMuted);
export const usePlayerPhase = () => usePlaybackStore((s) => s.phase);
export const useCurrentStepIndex = () => usePlaybackStore((s) => s.currentStepIndex);
export const usePendingClickTargetId = () => usePlaybackStore((s) => s.pendingClickTargetId);
export const useReplayableItems = () => usePlaybackStore((s) => s.replayableItems);
export const useEffectLoopRemaining = () => usePlaybackStore((s) => s.effectLoopRemaining);

export const useCurrentStep = () =>
  usePlaybackStore((s) =>
    s.currentStepIndex >= 0 ? s.steps[s.currentStepIndex] ?? null : null
  );

export const useNarrationLanguage = () => usePlaybackStore((s) => s.narrationLanguage);
export const useQuizLanguage = () => usePlaybackStore((s) => s.quizLanguage);
export const useSpreadHistories = () => usePlaybackStore((s) => s.spreadHistories);
export const useCurrentSection = () => usePlaybackStore((s) => s.currentSection);

export const useActiveAnimationOrders = () => usePlaybackStore((s) => s.activeAnimationOrders);
export const useMaxActivatedOrder = () => usePlaybackStore((s) => s.maxActivatedOrder);

export const usePlaybackActions = () =>
  usePlaybackStore(
    useShallow((s) => ({
      play: s.play,
      pause: s.pause,
      setPlayMode: s.setPlayMode,
      setPlayEdition: s.setPlayEdition,
      setNarrationLanguage: s.setNarrationLanguage,
      setQuizLanguage: s.setQuizLanguage,
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
      pushSpreadHistory: s.pushSpreadHistory,
      popSpreadHistory: s.popSpreadHistory,
      clearSpreadHistory: s.clearSpreadHistory,
      setCurrentSection: s.setCurrentSection,
    }))
  );
