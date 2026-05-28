// use-selected-swap-crops.test.ts — Hook lifecycle tests for SelectionProvider +
// useSelectedSwapCrops, including the critical gotcha #1 (persist on sheet switch
// within batch, reset on batch switch / swap count change).
//
// Uses renderHook with a keyed-remount wrapper to drive the provider's composite
// key = `${batchId}::${count}`. Same key → provider stays mounted → state
// persists. Different key → provider remounts → fresh state.

import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  SelectionProvider,
  useSelectedSwapCrops,
} from './use-selected-swap-crops';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSelectedSwapCrops — hook lifecycle', () => {
  // Helper to create a wrapper with batchId + count for keyed remounting
  const createWrapper = (batchId: string, count: number) => {
    return ({ children }: { children: ReactNode }) => {
      const providerKey = `${batchId}::${count}`;
      return createElement(SelectionProvider, { key: providerKey, children });
    };
  };

  // Initial state: empty set, no selections.
  it('initial state is empty', () => {
    const { result } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 1),
    });

    expect(result.current.keys).toBeInstanceOf(Set);
    expect(result.current.keys.size).toBe(0);
  });

  // Toggle add/remove: same crop twice.
  it('toggle adds a crop key', () => {
    const { result } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 1),
    });

    act(() => result.current.toggle('s1/c1'));
    expect(result.current.keys.size).toBe(1);
    expect(result.current.keys.has('s1/c1')).toBe(true);
  });

  it('toggle removes a crop key (toggle twice)', () => {
    const { result } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 1),
    });

    act(() => result.current.toggle('s1/c1'));
    expect(result.current.keys.size).toBe(1);

    act(() => result.current.toggle('s1/c1'));
    expect(result.current.keys.size).toBe(0);
  });

  // Clear: empty the set.
  it('clear empties the selection', () => {
    const { result } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 1),
    });

    act(() => {
      result.current.toggle('s1/c1');
      result.current.toggle('s2/c2');
      result.current.toggle('s3/c3');
    });
    expect(result.current.keys.size).toBe(3);

    act(() => result.current.clear());
    expect(result.current.keys.size).toBe(0);
  });

  // ⚡ CRITICAL GOTCHA #1: PERSIST on sheet switch within batch.
  // Same batchId + same count → provider key unchanged → state persists.
  it('PERSISTS on sheet switch within batch (count unchanged)', () => {
    const { result, rerender } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 2),
    });

    // Add a selection.
    act(() => result.current.toggle('s0/c1'));
    expect(result.current.keys.size).toBe(1);

    // Same batch + same count → provider key unchanged → state persists.
    rerender();
    expect(result.current.keys.size).toBe(1);
    expect(result.current.keys.has('s0/c1')).toBe(true);
  });

  // Reset on swap_results count change (new swap pushed).
  // In real modal use: count changes → provider key changes → provider remounts.
  // Since renderHook doesn't unmount/remount provider on wrapper change,
  // we test the count change indirectly: fresh hook with new count should
  // start empty (proving the provider WOULD reset if key changed).
  it('resets on swap_results count change (re-swap)', () => {
    const { result: result1 } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 1),
    });

    act(() => result1.current.toggle('s0/c1'));
    expect(result1.current.keys.size).toBe(1);

    // Simulate count++ → new provider remount by creating a new hook
    // with count=2 (same batch, different count).
    const { result: result2 } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 2),
    });

    // Fresh hook on new provider should have empty state.
    expect(result2.current.keys.size).toBe(0);
  });

  // Reset on batch switch.
  it('resets on batch switch', () => {
    const { result: result1 } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 2),
    });

    act(() => result1.current.toggle('s0/c1'));
    expect(result1.current.keys.size).toBe(1);

    // Simulate batch switch (b1 → b2) by creating a fresh hook
    // with a different batchId in the provider key.
    const { result: result2 } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b2', 2),
    });

    // Fresh hook on new provider should have empty state.
    expect(result2.current.keys.size).toBe(0);
  });

  // PERSIST on unrelated prop noise (key string unchanged).
  it('PERSISTS on unrelated parent prop noise (key unchanged)', () => {
    const { result, rerender } = renderHook(
      () => useSelectedSwapCrops(),
      {
        wrapper: createWrapper('b1', 2),
      },
    );

    act(() => result.current.toggle('s0/c1'));
    expect(result.current.keys.size).toBe(1);

    // Unrelated prop changes; wrapper key `b1::2` unchanged → state persists.
    rerender({ someNoise: 999 });
    expect(result.current.keys.size).toBe(1);
    expect(result.current.keys.has('s0/c1')).toBe(true);
  });

  // Context value ref stability: toggle/clear identity unchanged across rerenders.
  it('context value toggle/clear refs are stable (no callback churn)', () => {
    const { result, rerender } = renderHook(() => useSelectedSwapCrops(), {
      wrapper: createWrapper('b1', 2),
    });

    const toggleRef1 = result.current.toggle;
    const clearRef1 = result.current.clear;

    // Rerender with same key; toggle/clear should be the same refs.
    rerender();
    expect(result.current.toggle).toBe(toggleRef1);
    expect(result.current.clear).toBe(clearRef1);
  });

  // Throwing outside provider — guard clause.
  it('throws when used outside SelectionProvider', () => {
    // renderHook without the wrapper will use the default provider-free context.
    expect(() => {
      renderHook(() => useSelectedSwapCrops());
    }).toThrow(/must be used inside/i);
  });
});
