// run-character-swap.test.ts — Swap orchestration state machine (Validation S1).
// Deps (buildRequest + swap) are injected so we assert swapTasks transitions +
// onUpsert without hitting the real Gemini-backed endpoint.

import { describe, it, expect, vi } from 'vitest';
import { runCharacterSwap, type RunCharacterSwapDeps } from './run-character-swap';
import type { SwapPreviewState, RemixCharacterChoice } from '@/types/remix';
import type { SwapVisualCoreRequest } from '@/apis/remix-swap-visual-api';

const ENTRY: RemixCharacterChoice = {
  key: 'c1',
  human_id: 'h1',
  visual: 'vp1',
  traits: [{ type: 'face', is_enabled: true }],
  base_image_url: null,
  is_enabled: true,
};

const FAKE_REQUEST = {} as SwapVisualCoreRequest;

function harness() {
  const tasks: Array<{ key: string; state: SwapPreviewState }> = [];
  const setTask = vi.fn((key: string, state: SwapPreviewState) => {
    tasks.push({ key, state });
  });
  const onUpsert = vi.fn();
  return { tasks, setTask, onUpsert };
}

describe('runCharacterSwap — orchestration', () => {
  it('success: loading → done, onUpsert(base_image_url), afterUrl set', async () => {
    const { tasks, setTask, onUpsert } = harness();
    const deps: RunCharacterSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runCharacterSwap('c1', ENTRY, 'https://before.png', {}, [], setTask, onUpsert, deps);

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'done']);
    expect(tasks[0].state).toMatchObject({ beforeUrl: 'https://before.png', afterUrl: null });
    expect(tasks[1].state).toMatchObject({
      status: 'done',
      beforeUrl: 'https://before.png',
      afterUrl: 'https://after.png',
    });
    expect(onUpsert).toHaveBeenCalledWith('c1', { base_image_url: 'https://after.png' });
  });

  it('API error: loading → error, no base_image_url upsert', async () => {
    const { tasks, setTask, onUpsert } = harness();
    const deps: RunCharacterSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({ success: false, errorCode: 'GEMINI_API_ERROR', error: 'boom' })),
    };

    await runCharacterSwap('c1', ENTRY, 'https://before.png', {}, [], setTask, onUpsert, deps);

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBeTruthy();
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('guard fail: error immediately, API not called', async () => {
    const { tasks, setTask, onUpsert } = harness();
    const swap = vi.fn(async () => ({ success: true, data: { image_url: 'x', width: 1, height: 1 } }));
    const deps: RunCharacterSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: false as const, reason: 'NO_HUMAN' as const })),
      swap,
    };

    await runCharacterSwap('c1', ENTRY, null, {}, [], setTask, onUpsert, deps);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].state.status).toBe('error');
    expect(tasks[0].state.errorMessage).toBe('Pick a human first.');
    expect(swap).not.toHaveBeenCalled();
    expect(onUpsert).not.toHaveBeenCalled();
  });
});
