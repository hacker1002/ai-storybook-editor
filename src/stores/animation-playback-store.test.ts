// animation-playback-store.test.ts — Lifecycle, guard policy, error state.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  usePlaybackStore,
  guardedGetState,
  type InitializePayload,
} from './animation-playback-store';

function makePayload(overrides: Partial<InitializePayload> = {}): InitializePayload {
  return {
    sessionId: 'test:1',
    language: 'en_US',
    edition: 'interactive',
    availableEditions: undefined,
    startSpreadId: 'spread-a',
    ...overrides,
  };
}

beforeEach(() => {
  usePlaybackStore.getState().teardown();
  // Reset user prefs to known defaults too — teardown preserves them.
  usePlaybackStore.setState({
    volume: 100,
    isMuted: false,
    narrationLanguage: 'en_US',
    quizLanguage: 'en_US',
    playEdition: 'interactive',
    playMode: 'off',
  });
});

describe('lifecycle', () => {
  it('initialize from idle transitions to ready and seeds session', () => {
    const payload = makePayload({ sessionId: 'test:1', edition: 'classic', startSpreadId: 'sp-1' });
    usePlaybackStore.getState().initialize(payload);
    const s = usePlaybackStore.getState();
    expect(s.lifecycle).toBe('ready');
    expect(s.sessionId).toBe('test:1');
    expect(s.playEdition).toBe('classic');
    expect(s.spreadHistories).toEqual([{ spreadId: 'sp-1', section: null }]);
    expect(s.steps).toEqual([]);
    expect(s.phase).toBe('idle');
  });

  it('initialize with same sessionId preserves in-memory edition toggle', () => {
    usePlaybackStore.getState().initialize(makePayload({ sessionId: 'test:1', edition: 'classic' }));
    usePlaybackStore.getState().setPlayEdition('interactive');
    usePlaybackStore.getState().initialize(makePayload({ sessionId: 'test:1', edition: 'classic' }));
    expect(usePlaybackStore.getState().playEdition).toBe('interactive');
  });

  it('initialize with different sessionId applies payload edition', () => {
    // Per Validation Session 1: use 'classic' as the user-toggled value to disambiguate
    // from the default 'interactive' — a test passing because of the default would be a false positive.
    usePlaybackStore.getState().initialize(makePayload({ sessionId: 'test:1', edition: 'classic' }));
    usePlaybackStore.getState().setPlayEdition('classic');
    usePlaybackStore.getState().initialize(makePayload({ sessionId: 'test:2', edition: 'dynamic' }));
    expect(usePlaybackStore.getState().playEdition).toBe('dynamic');
  });

  it('teardown returns to idle but preserves user preferences', () => {
    usePlaybackStore.getState().initialize(makePayload());
    usePlaybackStore.getState().setVolume(42);
    usePlaybackStore.getState().setNarrationLanguage('vi_VN');
    usePlaybackStore.getState().teardown();
    const s = usePlaybackStore.getState();
    expect(s.lifecycle).toBe('idle');
    expect(s.sessionId).toBeNull();
    expect(s.volume).toBe(42);
    expect(s.narrationLanguage).toBe('vi_VN');
    expect(s.spreadHistories).toEqual([]);
  });

  it('teardown is idempotent', () => {
    usePlaybackStore.getState().teardown();
    expect(usePlaybackStore.getState().lifecycle).toBe('idle');
    usePlaybackStore.getState().teardown();
    expect(usePlaybackStore.getState().lifecycle).toBe('idle');
  });
});

describe('guard policy', () => {
  it('play() is a noop when lifecycle is idle', () => {
    expect(usePlaybackStore.getState().lifecycle).toBe('idle');
    const before = usePlaybackStore.getState().isPlaying;
    usePlaybackStore.getState().play();
    expect(usePlaybackStore.getState().isPlaying).toBe(before);
  });

  it('reset() is a noop when lifecycle is idle', () => {
    const before = usePlaybackStore.getState().steps;
    usePlaybackStore.getState().reset([
      { animations: [], triggerType: 'on_next', mustComplete: false } as never,
    ]);
    expect(usePlaybackStore.getState().steps).toBe(before);
  });

  it('setVolume() works even when lifecycle is idle (user preference)', () => {
    usePlaybackStore.getState().setVolume(33);
    expect(usePlaybackStore.getState().volume).toBe(33);
  });

  it('setPlayEdition() works even when lifecycle is idle (user preference)', () => {
    usePlaybackStore.getState().setPlayEdition('dynamic');
    expect(usePlaybackStore.getState().playEdition).toBe('dynamic');
  });
});

describe('error state (watchdog)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('transitions idle → error after INIT_TIMEOUT_MS when a guarded action is called', () => {
    // Trigger watchdog by attempting a guarded action while idle.
    usePlaybackStore.getState().play();
    expect(usePlaybackStore.getState().lifecycle).toBe('idle');
    vi.runAllTimers();
    expect(usePlaybackStore.getState().lifecycle).toBe('error');
  });

  it('actions remain noop in error state (no state mutation)', () => {
    usePlaybackStore.getState().play(); // start watchdog
    vi.runAllTimers();
    expect(usePlaybackStore.getState().lifecycle).toBe('error');
    const before = usePlaybackStore.getState().isPlaying;
    usePlaybackStore.getState().play();
    expect(usePlaybackStore.getState().isPlaying).toBe(before);
  });

  it('initialize from error transitions to ready and clears the watchdog', () => {
    usePlaybackStore.getState().play(); // start watchdog
    vi.runAllTimers();
    expect(usePlaybackStore.getState().lifecycle).toBe('error');
    usePlaybackStore.getState().initialize(makePayload({ sessionId: 'recover:1' }));
    expect(usePlaybackStore.getState().lifecycle).toBe('ready');
    expect(usePlaybackStore.getState().sessionId).toBe('recover:1');
    // Pump timers — a stale watchdog from before initialize would now flip ready→error.
    vi.runAllTimers();
    expect(usePlaybackStore.getState().lifecycle).toBe('ready');
  });
});

describe('guardedGetState', () => {
  it('returns null when lifecycle !== ready', () => {
    expect(guardedGetState()).toBeNull();
  });

  it('returns full state object when lifecycle === ready', () => {
    usePlaybackStore.getState().initialize(makePayload());
    const s = guardedGetState();
    expect(s).not.toBeNull();
    expect(s?.lifecycle).toBe('ready');
    expect(typeof s?.play).toBe('function');
  });
});
