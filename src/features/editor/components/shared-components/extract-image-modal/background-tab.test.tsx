// background-tab.test.tsx — useBackgroundTabState (design 04-background-tab.md §2/§4).
// Covers: lazy seed + 16-cap, canRun gating, runExtract payload + success/failure/empty
// mapping, reset re-seed, and removeItem via the rendered chip × buttons (plain DOM —
// Radix picker portal intentionally not driven in jsdom).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import type { BackgroundRemoveCandidate } from './extract-image-modal-constants';
import { useBackgroundTabState, type BackgroundTabHandle } from './background-tab';

// Mock the AI client — runExtract is the only network seam.
vi.mock('@/apis/retouch-api', () => ({
  callGenerateBackground: vi.fn(),
}));
import { callGenerateBackground } from '@/apis/retouch-api';
const mockCall = vi.mocked(callGenerateBackground);

const IMAGE = { id: 'src-1', title: 'Scene' } as SpreadImage;
const SOURCE_URL = 'https://storage/source.png';

function makeCandidates(n: number): BackgroundRemoveCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cand-${i}`,
    media_url: `https://storage/obj-${i}.png`,
    title: `Object ${i}`,
    type: i % 2 === 0 ? ('character' as const) : ('prop' as const),
  }));
}

function okResponse(removedCount: number) {
  return {
    success: true as const,
    data: { imageUrl: 'https://storage/bg-1.png', storagePath: 'extract-results/bg-1.png' },
    meta: { removedCount, model: 'google/nano-banana-pro' },
  };
}

function renderTab(candidates: BackgroundRemoveCandidate[]) {
  return renderHook(() =>
    useBackgroundTabState(IMAGE, {
      isBusy: false,
      onRequestRun: () => {},
      removeCandidates: candidates,
    }),
  );
}

beforeEach(() => {
  mockCall.mockReset();
});

describe('useBackgroundTabState — seed + canRun', () => {
  it('seeds all candidates (≤16) → canRun true', () => {
    const { result } = renderTab(makeCandidates(3));
    expect(result.current.canRun).toBe(true);
    expect(result.current.model).toBe('google/nano-banana-pro');
  });

  it('no candidates → canRun false', () => {
    const { result } = renderTab([]);
    expect(result.current.canRun).toBe(false);
  });

  it('caps the seed at 16 even with 20 candidates (runExtract payload size)', async () => {
    mockCall.mockResolvedValue(okResponse(16));
    const { result } = renderTab(makeCandidates(20));
    expect(result.current.canRun).toBe(true);
    await act(async () => {
      await result.current.runExtract(SOURCE_URL);
    });
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0].removeObjects).toHaveLength(16);
  });
});

describe('useBackgroundTabState — runExtract', () => {
  it('maps a success into ONE permanent background ExtractResult', async () => {
    mockCall.mockResolvedValue(okResponse(2));
    const { result } = renderTab(makeCandidates(2));

    let out: Awaited<ReturnType<BackgroundTabHandle['runExtract']>> = [];
    await act(async () => {
      out = await result.current.runExtract(SOURCE_URL);
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      media_url: 'https://storage/bg-1.png',
      sourceTab: 'background',
      meta: { permanent: true, removedCount: 2 },
    });
    expect(out[0].title).toContain('Background 1');

    // Payload wiring: source URL + URL-only removeObjects + default model omits modelParams.
    const payload = mockCall.mock.calls[0][0];
    expect(payload.imageUrl).toBe(SOURCE_URL);
    expect(payload.removeObjects[0]).toEqual({
      imageUrl: 'https://storage/obj-0.png',
      name: 'Object 0',
      type: 'character',
    });
    expect(payload.modelParams).toBeUndefined();
    expect(payload.prompt).toBeUndefined();
  });

  it('throws a mapped error on API failure', async () => {
    const failure: ImageApiFailure = {
      success: false,
      error: 'boom',
      errorCode: 'TIMEOUT',
      httpStatus: 504,
    };
    mockCall.mockResolvedValue(failure);
    const { result } = renderTab(makeCandidates(1));

    await expect(
      act(async () => {
        await result.current.runExtract(SOURCE_URL);
      }),
    ).rejects.toThrow('The request timed out. Please try again.');
  });

  it('returns [] without calling the API when nothing is queued', async () => {
    const { result } = renderTab([]);
    let out: unknown[] = [{}];
    await act(async () => {
      out = await result.current.runExtract(SOURCE_URL);
    });
    expect(out).toHaveLength(0);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('monotonic ordinal across appended runs', async () => {
    mockCall.mockResolvedValue(okResponse(1));
    const { result } = renderTab(makeCandidates(1));
    let first: { title: string }[] = [];
    let second: { title: string }[] = [];
    await act(async () => {
      first = await result.current.runExtract(SOURCE_URL);
    });
    await act(async () => {
      second = await result.current.runExtract(SOURCE_URL);
    });
    expect(first[0].title).toContain('Background 1');
    expect(second[0].title).toContain('Background 2');
  });
});

describe('useBackgroundTabState — reset', () => {
  it('re-seeds removeItems from candidates → canRun stays true', () => {
    const { result } = renderTab(makeCandidates(2));
    act(() => result.current.reset());
    expect(result.current.canRun).toBe(true);
  });
});

// ── removeItem via the rendered chip × buttons (plain DOM, no Radix portal) ──
describe('ParamsPanel — removeItem', () => {
  function Harness({
    candidates,
    onHandle,
  }: {
    candidates: BackgroundRemoveCandidate[];
    onHandle: (h: BackgroundTabHandle) => void;
  }) {
    const handle = useBackgroundTabState(IMAGE, {
      isBusy: false,
      onRequestRun: () => {},
      removeCandidates: candidates,
    });
    onHandle(handle);
    return <div>{handle.ParamsPanel}</div>;
  }

  it('renders one chip per seeded item and removes on ×', () => {
    let handle!: BackgroundTabHandle;
    render(<Harness candidates={makeCandidates(2)} onHandle={(h) => (handle = h)} />);

    let removeButtons = screen.getAllByRole('button', { name: /remove .* from list/i });
    expect(removeButtons).toHaveLength(2);
    expect(handle.canRun).toBe(true);

    act(() => removeButtons[0].click());
    removeButtons = screen.getAllByRole('button', { name: /remove .* from list/i });
    expect(removeButtons).toHaveLength(1);
    expect(handle.canRun).toBe(true);

    act(() => removeButtons[0].click());
    expect(screen.queryAllByRole('button', { name: /remove .* from list/i })).toHaveLength(0);
    expect(handle.canRun).toBe(false);
  });
});
