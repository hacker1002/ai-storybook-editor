// player-audio-store.ts — Zustand singleton store for the player audio mixer.
//
// Design source: ai-storybook-design/component/stores/player-audio-store.md
// Phase plan: plans/260505-1455-player-audio-mixer-frontend-impl/phase-02-use-audio-mixer-hook.md
//
// Two-phase init:
//   Phase A — initContext() : sync, pre-gesture. Creates suspended AudioContext + 3 GainNodes.
//   Phase B — resumeContext(): async, in-gesture (FirstGestureGate). ctx.resume() + flush autoStartQueue.
//
// Smart play API (route ALL <audio data-audio-channel> playback through here):
//   requestPlay(el): running -> el.play() / suspended -> autoStartQueue.add(el)
//   cancelPlay(el):  unmount cleanup — remove from queue + pause if playing
//
// Module-level (NOT in Zustand state — Web Audio resources don't serialize):
//   sourceRegistry: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>
//   autoStartQueue: Set<HTMLAudioElement>

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@/utils/logger';
import {
  AUDIO_CHANNELS,
  GAIN_RAMP_SECONDS,
  effectiveGain,
  truncateSrc,
  type AudioChannel,
  type BookAudioSettings,
} from '@/features/editor/components/playable-spread-view/audio/audio-mixer-types';

const log = createLogger('Editor', 'PlayerAudioStore');

// ── Module-level resources (not serializable, not in Zustand state) ────────────
let sourceRegistry: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();
let autoStartQueue: Set<HTMLAudioElement> = new Set();
/** Warm <audio> pool keyed by URL. Detached from DOM; pre-attached to mixer.
 *  Survives across spread advances within player session; evicted on language
 *  change or teardown. Eliminates per-tween element re-decode latency. */
let audioPool: Map<string, HTMLAudioElement> = new Map();

// ── Public types ────────────────────────────────────────────────────────────────
export interface ApplyGainsParams {
  masterVolume: number; // 0..100
  isMuted: boolean;
  bookAudio: BookAudioSettings;
}

export interface PlayerAudioState {
  contextCreated: boolean;
  contextRunning: boolean;
  audioContext: AudioContext | null;
  gains: Record<AudioChannel, GainNode> | null;
  lastGains: Record<AudioChannel, number> | null;
}

export interface PlayerAudioActions {
  initContext: () => void;
  resumeContext: () => Promise<void>;
  attachAudio: (el: HTMLAudioElement) => void;
  requestPlay: (el: HTMLAudioElement) => void;
  cancelPlay: (el: HTMLAudioElement) => void;
  applyGains: (params: ApplyGainsParams) => void;
  /** Warm an audio element for `url` and attach it to `channel`. Idempotent. */
  preloadAudio: (url: string, channel: AudioChannel) => void;
  /** Get pooled element for `url` (creates + warms on miss). Always attached to mixer. */
  acquireAudio: (url: string, channel: AudioChannel) => HTMLAudioElement;
  /** Pause + drop one entry from pool. */
  releaseAudio: (url: string) => void;
  /** Bulk evict — call on language change. */
  releaseAllAudio: () => void;
  /** Pause every currently-playing pooled element; returns list of paused elements
   *  so the GSAP engine can resume them via its existing pausedMediaRef. */
  pauseAllPooledAudio: () => HTMLAudioElement[];
  teardown: () => void;
}

type Store = PlayerAudioState & PlayerAudioActions;

// ── Initial state ───────────────────────────────────────────────────────────────
const INITIAL_STATE: PlayerAudioState = {
  contextCreated: false,
  contextRunning: false,
  audioContext: null,
  gains: null,
  lastGains: null,
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
function isAudioChannel(value: string | undefined): value is AudioChannel {
  return value === 'bgm' || value === 'sfx' || value === 'narration';
}

function gainsEqual(
  a: Record<AudioChannel, number> | null,
  b: Record<AudioChannel, number>,
): boolean {
  if (!a) return false;
  return a.bgm === b.bgm && a.sfx === b.sfx && a.narration === b.narration;
}

// ── Store ───────────────────────────────────────────────────────────────────────
export const usePlayerAudioStore = create<Store>()(
  devtools(
    (set, get) => ({
      ...INITIAL_STATE,

      // Phase A — sync, pre-gesture
      initContext: () => {
        if (get().contextCreated) {
          log.debug('initContext', 'already_created');
          return;
        }
        try {
          const ctx = new AudioContext();
          const gainBgm = ctx.createGain();
          const gainSfx = ctx.createGain();
          const gainNarration = ctx.createGain();
          gainBgm.connect(ctx.destination);
          gainSfx.connect(ctx.destination);
          gainNarration.connect(ctx.destination);
          gainBgm.gain.value = 1;
          gainSfx.gain.value = 1;
          gainNarration.gain.value = 1;
          set({
            contextCreated: true,
            contextRunning: false,
            audioContext: ctx,
            gains: { bgm: gainBgm, sfx: gainSfx, narration: gainNarration },
            lastGains: { bgm: 1, sfx: 1, narration: 1 },
          });
          log.info('initContext', 'audio_mixer_init', {
            state: ctx.state,
            sampleRate: ctx.sampleRate,
          });
        } catch (err) {
          log.error('initContext', 'audio_context_create_failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      // Phase B — async, gesture handler
      resumeContext: async () => {
        const s = get();
        if (!s.contextCreated || !s.audioContext) {
          log.warn('resumeContext', 'called_before_init');
          return;
        }
        if (s.contextRunning) {
          log.debug('resumeContext', 'already_running');
          return;
        }
        try {
          await s.audioContext.resume();
        } catch (err) {
          log.warn('resumeContext', 'resume_failed', {
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        set({ contextRunning: true });

        // Flush autoStartQueue
        let flushedCount = 0;
        const queueSnapshot = Array.from(autoStartQueue);
        autoStartQueue.clear();
        for (const el of queueSnapshot) {
          try {
            await el.play();
            flushedCount++;
          } catch (err) {
            log.warn('resumeContext', 'autostart_play_failed', {
              srcShort: truncateSrc(el.currentSrc),
              errorName: err instanceof Error ? err.name : String(err),
            });
          }
        }
        log.info('resumeContext', 'audio_mixer_autostart_flushed', { count: flushedCount });
      },

      attachAudio: (el) => {
        const channel = el.dataset.audioChannel;
        if (!isAudioChannel(channel)) {
          log.warn('attachAudio', 'audio_mixer_unknown_channel', {
            channel,
            srcShort: truncateSrc(el.currentSrc),
          });
          return;
        }
        if (sourceRegistry.has(el)) {
          log.debug('attachAudio', 'already_attached', { srcShort: truncateSrc(el.currentSrc) });
          return;
        }
        const s = get();
        if (!s.contextCreated || !s.audioContext || !s.gains) {
          log.debug('attachAudio', 'not_ready_defer', { srcShort: truncateSrc(el.currentSrc) });
          return;
        }
        if (el.crossOrigin !== 'anonymous') {
          log.warn('attachAudio', 'audio_mixer_missing_cors', {
            srcShort: truncateSrc(el.currentSrc),
            crossOrigin: el.crossOrigin,
          });
          // continue — same-origin still works
        }
        try {
          const src = s.audioContext.createMediaElementSource(el);
          src.connect(s.gains[channel]);
          sourceRegistry.set(el, src);
          log.info('attachAudio', 'audio_mixer_attached', {
            channel,
            srcShort: truncateSrc(el.currentSrc),
          });
        } catch (err) {
          // 2nd call on same element throws InvalidStateError — registry guard above
          // should prevent it, but catch defensively in case of cross-store leak.
          const errorName = err instanceof Error ? err.name : String(err);
          if (errorName === 'InvalidStateError') {
            log.warn('attachAudio', 'audio_mixer_double_attach', {
              srcShort: truncateSrc(el.currentSrc),
              errorName,
            });
          } else {
            log.warn('attachAudio', 'attach_failed', {
              srcShort: truncateSrc(el.currentSrc),
              errorName,
            });
          }
        }
      },

      requestPlay: (el) => {
        const s = get();
        if (s.contextRunning) {
          const playPromise = el.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch((err: unknown) => {
              const errName = err instanceof Error ? err.name : String(err);
              if (errName === 'AbortError') return; // benign Strict-Mode cleanup
              log.warn('requestPlay', 'play_failed', {
                srcShort: truncateSrc(el.currentSrc),
                errorName: errName,
              });
            });
          }
          return;
        }
        if (autoStartQueue.has(el)) return;
        autoStartQueue.add(el);
        log.debug('requestPlay', 'queued', { queueSize: autoStartQueue.size });
      },

      cancelPlay: (el) => {
        const removed = autoStartQueue.delete(el);
        try {
          if (!el.paused) el.pause();
        } catch {
          // Element may be detached — ignore
        }
        if (removed) {
          log.debug('cancelPlay', 'cancelled', { srcShort: truncateSrc(el.currentSrc) });
        }
      },

      applyGains: (params) => {
        const s = get();
        if (!s.contextCreated || !s.audioContext || !s.gains) return;
        const newGains: Record<AudioChannel, number> = {
          bgm: effectiveGain('bgm', params),
          sfx: effectiveGain('sfx', params),
          narration: effectiveGain('narration', params),
        };
        if (gainsEqual(s.lastGains, newGains)) return; // dedupe
        const ctx = s.audioContext;
        const targetTime = ctx.currentTime + GAIN_RAMP_SECONDS;
        for (const ch of AUDIO_CHANNELS) {
          const target = newGains[ch];
          if (target > 1.0) {
            log.debug('applyGains', 'audio_mixer_amplification', { channel: ch, gain: target });
          }
          const g = s.gains[ch].gain;
          g.cancelScheduledValues(ctx.currentTime);
          g.linearRampToValueAtTime(target, targetTime);
        }
        set({ lastGains: newGains });
        log.info('applyGains', 'audio_mixer_gain_applied', {
          master: params.masterVolume,
          muted: params.isMuted,
          bgm: newGains.bgm,
          sfx: newGains.sfx,
          narration: newGains.narration,
        });
      },

      preloadAudio: (url, channel) => {
        if (!url) return;
        if (audioPool.has(url)) return;
        const el = new Audio();
        el.crossOrigin = 'anonymous';
        el.dataset.audioChannel = channel;
        el.dataset.pooled = 'true';
        el.preload = 'auto';
        el.src = url;
        el.load();
        audioPool.set(url, el);
        // Attempt mixer attachment immediately; attachAudio guards on context
        // readiness internally, so a not-yet-init context simply skips wiring
        // (rare given player-mode mount order, accepted as graceful degradation).
        get().attachAudio(el);
        log.info('preloadAudio', 'audio_pool_primed', {
          channel,
          poolSize: audioPool.size,
          srcShort: truncateSrc(url),
        });
      },

      acquireAudio: (url, channel) => {
        const existing = audioPool.get(url);
        if (existing) {
          log.debug('acquireAudio', 'audio_pool_hit', { srcShort: truncateSrc(url) });
          return existing;
        }
        get().preloadAudio(url, channel);
        const created = audioPool.get(url);
        // preloadAudio just inserted on cache-miss path → guaranteed present.
        log.info('acquireAudio', 'audio_pool_miss_primed', { srcShort: truncateSrc(url) });
        return created!;
      },

      releaseAudio: (url) => {
        const el = audioPool.get(url);
        if (!el) return;
        try {
          el.pause();
        } catch {
          // detached — ignore
        }
        el.src = '';
        audioPool.delete(url);
        log.debug('releaseAudio', 'audio_pool_released', {
          srcShort: truncateSrc(url),
          poolSize: audioPool.size,
        });
      },

      releaseAllAudio: () => {
        if (audioPool.size === 0) return;
        const count = audioPool.size;
        for (const [, el] of audioPool) {
          try {
            el.pause();
          } catch {
            // ignore
          }
          el.src = '';
        }
        audioPool.clear();
        log.info('releaseAllAudio', 'audio_pool_evicted_all', { count });
      },

      pauseAllPooledAudio: () => {
        const paused: HTMLAudioElement[] = [];
        for (const [, el] of audioPool) {
          if (!el.paused) {
            try {
              el.pause();
              paused.push(el);
            } catch {
              // ignore
            }
          }
        }
        return paused;
      },

      teardown: () => {
        const s = get();
        if (!s.contextCreated) return;
        // Pause any queued elements first
        for (const el of autoStartQueue) {
          try {
            el.pause();
          } catch {
            // detached — ignore
          }
        }
        // Evict pool before context close so element src='' lands first.
        get().releaseAllAudio();
        try {
          if (s.gains) {
            s.gains.bgm.disconnect();
            s.gains.sfx.disconnect();
            s.gains.narration.disconnect();
          }
          if (s.audioContext) {
            void s.audioContext.close();
          }
        } catch (err) {
          log.warn('teardown', 'teardown_error', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        sourceRegistry = new WeakMap();
        autoStartQueue = new Set();
        audioPool = new Map();
        set({ ...INITIAL_STATE });
        log.info('teardown', 'audio_mixer_closed');
      },
    }),
    { name: 'player-audio-store' },
  ),
);

// ── Selectors ───────────────────────────────────────────────────────────────────
export const useContextCreated = () => usePlayerAudioStore((s) => s.contextCreated);
export const useContextRunning = () => usePlayerAudioStore((s) => s.contextRunning);

export const usePlayerAudioActions = (): PlayerAudioActions =>
  usePlayerAudioStore(
    useShallow((s) => ({
      initContext: s.initContext,
      resumeContext: s.resumeContext,
      attachAudio: s.attachAudio,
      requestPlay: s.requestPlay,
      cancelPlay: s.cancelPlay,
      applyGains: s.applyGains,
      preloadAudio: s.preloadAudio,
      acquireAudio: s.acquireAudio,
      releaseAudio: s.releaseAudio,
      releaseAllAudio: s.releaseAllAudio,
      pauseAllPooledAudio: s.pauseAllPooledAudio,
      teardown: s.teardown,
    })),
  );
