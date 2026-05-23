// selectors-character-swap.test.ts — Tests the real useEntitySwapTask /
// useAnySwapRunning selectors deriving swap state from the jobs[] slice
// (Phase 01 — single source of truth, no separate task map).

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemixStore } from './index';
import { useEntitySwapTask, useAnySwapRunning } from './selectors';
import type { RemixJob, RemixJobStatus } from '@/types/remix';

const REMIX = 'r1';

function job(overrides: Partial<RemixJob> = {}): RemixJob {
  return {
    id: 'j1',
    remixId: REMIX,
    phase: 'character_swap',
    characterKey: 'elara',
    triggeredBy: 'user',
    status: 'queued' as RemixJobStatus,
    currentStep: 0,
    totalSteps: 3,
    cancelRequested: false,
    createdAt: '2026-05-23T00:00:00Z',
    updatedAt: '2026-05-23T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  useRemixStore.setState({ jobs: [] });
});

describe('useEntitySwapTask', () => {
  it('idle when no matching job', () => {
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toEqual({ state: 'idle' });
  });

  it('idle for prop/mix even if a character job exists', () => {
    useRemixStore.setState({ jobs: [job({ status: 'running' })] });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'prop', 'elara'));
    expect(result.current).toEqual({ state: 'idle' });
  });

  it('running carries current/total step counts', () => {
    useRemixStore.setState({ jobs: [job({ status: 'running', currentStep: 1, totalSteps: 4 })] });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toEqual({ state: 'running', current: 1, total: 4 });
  });

  it('completed with errors → error with failedSheets from result', () => {
    useRemixStore.setState({
      jobs: [
        job({
          status: 'completed',
          result: { errors: [{ stage: 'swap', message: 'gemini' }], failed_sheets: 2 },
        }),
      ],
    });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toEqual({ state: 'error', message: 'gemini', failedSheets: 2 });
  });

  it('completed clean → idle', () => {
    useRemixStore.setState({ jobs: [job({ status: 'completed', result: { errors: [] } })] });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toEqual({ state: 'idle' });
  });

  it('failed → error', () => {
    useRemixStore.setState({
      jobs: [job({ status: 'failed', result: { errors: [{ stage: 'resolve', message: 'no human' }] } })],
    });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toMatchObject({ state: 'error', message: 'no human' });
  });

  it('picks the latest job by createdAt when multiple match', () => {
    useRemixStore.setState({
      jobs: [
        job({ id: 'old', status: 'completed', result: { errors: [] }, createdAt: '2026-05-22T00:00:00Z' }),
        job({ id: 'new', status: 'running', currentStep: 2, totalSteps: 5, createdAt: '2026-05-23T12:00:00Z' }),
      ],
    });
    const { result } = renderHook(() => useEntitySwapTask(REMIX, 'character', 'elara'));
    expect(result.current).toEqual({ state: 'running', current: 2, total: 5 });
  });
});

describe('useAnySwapRunning', () => {
  it('false when no character_swap job is active', () => {
    useRemixStore.setState({ jobs: [job({ status: 'completed', result: { errors: [] } })] });
    const { result } = renderHook(() => useAnySwapRunning(REMIX));
    expect(result.current).toBe(false);
  });

  it('true when a character_swap job is queued or running', () => {
    useRemixStore.setState({ jobs: [job({ status: 'running' })] });
    const { result } = renderHook(() => useAnySwapRunning(REMIX));
    expect(result.current).toBe(true);
  });

  it('ignores jobs of other remixes', () => {
    useRemixStore.setState({ jobs: [job({ remixId: 'other', status: 'running' })] });
    const { result } = renderHook(() => useAnySwapRunning(REMIX));
    expect(result.current).toBe(false);
  });

  it('ignores non-character_swap phases', () => {
    useRemixStore.setState({ jobs: [job({ phase: 'audio', status: 'running' })] });
    const { result } = renderHook(() => useAnySwapRunning(REMIX));
    expect(result.current).toBe(false);
  });
});
