import { create } from 'zustand';
import { createLogger } from '@/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Audio Playback Bus — singleton zustand store enforcing single-active player
// across the GenerateNarrationModal (combined preview + per-chunk cards).
//
// Consumer pattern:
//   const activeId = useActivePlayerId();
//   useEffect(() => {
//     if (activeId !== myId && audioRef.current && !audioRef.current.paused) {
//       audioRef.current.pause();
//     }
//   }, [activeId, myId]);
//
//   onPlay  → playbackBus.requestPlay(myId)
//   onPause → playbackBus.notifyPause(myId)
//
// Player IDs convention:
//   - 'combined'        — combined preview player
//   - `chunk:${client_id}` — per-chunk preview player
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('Editor', 'AudioPlaybackBus');

interface PlaybackBusState {
  /** ID of the currently active player, or `null` when nothing is playing. */
  activePlayerId: string | null;
  /** Mark `id` as the active player. Other consumers will pause via subscription. */
  requestPlay: (id: string) => void;
  /** Clear active player when `id` matches; no-op otherwise (last-write-wins). */
  notifyPause: (id: string) => void;
}

export const useAudioPlaybackBus = create<PlaybackBusState>((set, get) => ({
  activePlayerId: null,

  requestPlay: (id) => {
    const prev = get().activePlayerId;
    if (prev === id) return;
    log.debug('requestPlay', 'set active', { prev, next: id });
    set({ activePlayerId: id });
  },

  notifyPause: (id) => {
    const prev = get().activePlayerId;
    if (prev !== id) {
      // Stale pause notify (another player already took over). Ignore.
      log.debug('notifyPause', 'ignored stale', { prev, id });
      return;
    }
    log.debug('notifyPause', 'clear active', { id });
    set({ activePlayerId: null });
  },
}));

/** Selector hook — subscribe only to `activePlayerId` to minimise re-renders. */
export function useActivePlayerId(): string | null {
  return useAudioPlaybackBus((s) => s.activePlayerId);
}

/** Imperative actions getter — stable references, safe outside React. */
export function getPlaybackBusActions(): {
  requestPlay: (id: string) => void;
  notifyPause: (id: string) => void;
} {
  const { requestPlay, notifyPause } = useAudioPlaybackBus.getState();
  return { requestPlay, notifyPause };
}
