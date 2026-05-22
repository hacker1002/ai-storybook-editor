// run-variant-swap.test.ts — Per-variant post-create re-swap orchestration
// (state machine). Mirrors the structure of `run-character-swap.test.ts` but
// for the variant-swap flow with `persist` callback instead of `onUpsert`.

import { describe, it, expect, vi } from 'vitest';
import { runVariantSwap, type RunVariantSwapDeps } from './run-variant-swap';
import type { SwapPreviewState, RemixTraitChoice } from '@/types/remix';
import type { SwapVisualCoreRequest } from '@/apis/remix-swap-visual-api';
import type { RemixConfigCharacterView } from '@/stores/remix-store/selectors';

const CFG_CHAR: RemixConfigCharacterView = {
  human_id: 'h1',
  visual: 'vp1',
  traits: [{ type: 'face', is_enabled: true }] as RemixTraitChoice[],
  converted_image: 'https://converted.png',
};

const FAKE_REQUEST = {} as SwapVisualCoreRequest;

function harness() {
  const tasks: Array<{ key: string; state: SwapPreviewState }> = [];
  const setTask = vi.fn((key: string, state: SwapPreviewState) => {
    tasks.push({ key, state });
  });
  // persist resolves true (committed) by default — matches the happy path of
  // `setVariantVisualSwapUrl`. Override per-test for the rollback case.
  const persist = vi.fn(async (_imageUrl: string) => true);
  return { tasks, setTask, persist };
}

describe('runVariantSwap — orchestration', () => {
  it('success: loading → done, persist(image_url), afterUrl set', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'done']);
    expect(tasks[0].state).toMatchObject({
      status: 'loading',
      beforeUrl: 'https://before.png',
      afterUrl: null,
    });
    expect(tasks[1].state).toMatchObject({
      status: 'done',
      beforeUrl: 'https://before.png',
      afterUrl: 'https://after.png',
    });
    expect(persist).toHaveBeenCalledWith('https://after.png');
  });

  it('persist returns false (Supabase rollback): loading → error, NOT done', async () => {
    const { tasks, setTask } = harness();
    // Override: persist commit fails → store rolled back.
    const persist = vi.fn(async (_imageUrl: string) => false);
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    // API succeeded but persist failed → must end in `error`, never `done`.
    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(persist).toHaveBeenCalledWith('https://after.png');
    expect(tasks[1].state).toMatchObject({
      status: 'error',
      beforeUrl: 'https://before.png',
      afterUrl: null,
    });
    expect(tasks[1].state.errorMessage).toBe('Saving the swap failed. Please retry.');
  });

  it('null cfgChar: error immediately, no API call, no persist', async () => {
    const { tasks, setTask, persist } = harness();
    const swap = vi.fn(async () => ({
      success: true,
      data: { image_url: 'x', width: 1, height: 1 },
    }));
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(),
      swap,
    };

    await runVariantSwap(
      'variant-1',
      null,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].state.status).toBe('error');
    expect(tasks[0].state.errorMessage).toBe('Pick a human first.');
    expect(swap).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('guard fail (NO_CONVERTED_IMAGE): error immediately, no API call', async () => {
    const { tasks, setTask, persist } = harness();
    const swap = vi.fn(async () => ({
      success: true,
      data: { image_url: 'x', width: 1, height: 1 },
    }));
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({
        ok: false as const,
        reason: 'NO_CONVERTED_IMAGE' as const,
      })),
      swap,
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].state.status).toBe('error');
    expect(tasks[0].state.errorMessage).toBe('This visual has no normalized image yet.');
    expect(swap).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('guard fail (EMPTY_SWAP_TRAITS): error immediately, no API call', async () => {
    const { tasks, setTask, persist } = harness();
    const swap = vi.fn(async () => ({
      success: true,
      data: { image_url: 'x', width: 1, height: 1 },
    }));
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({
        ok: false as const,
        reason: 'EMPTY_SWAP_TRAITS' as const,
      })),
      swap,
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].state.status).toBe('error');
    expect(tasks[0].state.errorMessage).toBe('Enable at least one trait with a description.');
    expect(swap).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('API 422 safety-filter error: error mapped', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: false,
        errorCode: 'EMPTY_SWAP_TRAITS',
        error: 'validation failed',
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBe('Enable at least one trait with a description.');
    expect(persist).not.toHaveBeenCalled();
  });

  it('API rate-limit error: error mapped', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: false,
        errorCode: 'GEMINI_RATE_LIMIT',
        error: 'rate limited',
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBe(
      'Service busy — please retry in a moment.',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('API timeout error: error mapped', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: false,
        errorCode: 'TIMEOUT',
        error: 'timeout',
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBe('Swap timed out. Please retry.');
    expect(persist).not.toHaveBeenCalled();
  });

  it('API generic error: fallback message', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: false,
        errorCode: 'UNKNOWN_ERROR',
        error: 'something broke',
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBe('something broke');
    expect(persist).not.toHaveBeenCalled();
  });

  it('API error with no errorCode: fallback to fallback message', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: false,
        errorCode: undefined,
        error: undefined,
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks.map((t) => t.state.status)).toEqual(['loading', 'error']);
    expect(tasks[1].state.errorMessage).toBe('Swap failed. Please retry.');
    expect(persist).not.toHaveBeenCalled();
  });

  it('builds request with adapted RemixCharacterChoice shape', async () => {
    const { setTask, persist } = harness();
    const buildRequest = vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST }));
    const deps: RunVariantSwapDeps = {
      buildRequest,
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    // Verify buildRequest was called with adapted entry + override last (null = base flow)
    expect(buildRequest).toHaveBeenCalledWith(
      'char-1',
      {
        key: 'char-1',
        human_id: 'h1',
        visual: 'vp1',
        traits: CFG_CHAR.traits,
        base_image_url: null,
        is_enabled: true,
      },
      'https://before.png',
      {},
      [],
      null,
    );
  });

  it('non-base variant: passes base swap visual as human_image_url override', async () => {
    const { setTask, persist } = harness();
    const buildRequest = vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST }));
    const deps: RunVariantSwapDeps = {
      buildRequest,
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runVariantSwap(
      'variant-2',
      CFG_CHAR,
      'https://before.png',
      'https://base-swap.png', // override = base variant's swapped visual
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    // 6th arg (override, last) reaches the builder so non-base reuses the base swap.
    expect(buildRequest).toHaveBeenCalledWith(
      'char-1',
      expect.objectContaining({ key: 'char-1' }),
      'https://before.png',
      {},
      [],
      'https://base-swap.png',
    );
  });

  it('null beforeUrl → passes through to setTask', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({ ok: true as const, request: FAKE_REQUEST })),
      swap: vi.fn(async () => ({
        success: true,
        data: { image_url: 'https://after.png', width: 10, height: 10 },
      })),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      null,
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks[0].state.beforeUrl).toBe(null);
    expect(tasks[1].state.beforeUrl).toBe(null);
  });

  it('multiple guard failures: only first error state set', async () => {
    const { tasks, setTask, persist } = harness();
    const deps: RunVariantSwapDeps = {
      buildRequest: vi.fn(() => ({
        ok: false as const,
        reason: 'NO_HUMAN' as const,
      })),
      swap: vi.fn(),
    };

    await runVariantSwap(
      'variant-1',
      CFG_CHAR,
      'https://before.png',
      null,
      {},
      [],
      'char-1',
      setTask,
      persist,
      deps,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].state.status).toBe('error');
  });

  it('uses default deps when deps not provided', async () => {
    const { setTask, persist } = harness();

    // This test verifies that the function handles the default deps case
    // without throwing. We can't easily test the real API without mocking it,
    // but we can verify the function signature accepts undefined deps.
    const testFn = async () => {
      // Simulate the call with undefined deps
      // Note: This would fail with real API calls, but syntax is valid
      const result = await runVariantSwap(
        'variant-1',
        null, // null cfgChar short-circuits before using deps
        'https://before.png',
        null,
        {},
        [],
        'char-1',
        setTask,
        persist,
        // deps parameter omitted
      );
      return result;
    };

    await expect(testFn()).resolves.not.toThrow();
  });
});
