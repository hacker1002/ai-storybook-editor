import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';
import { useIsAnySketchGenerating, useSketchSpreadGenerating } from '@/stores/snapshot-store/selectors';
import type { SketchSpreadGenerateJob } from '@/stores/snapshot-store/types';

const spreadJob = (
  tasks: { spreadId: string; status: 'pending' | 'running' | 'completed' | 'error'; error?: string }[],
): SketchSpreadGenerateJob => ({
  id: 'job-1',
  status: 'running',
  tasks: tasks.map((t, i) => ({ ...t, ordinal: i + 1 })),
  currentIndex: 0,
  cancelRequested: false,
  skipped: 0,
  skippedNames: [],
  createdAt: '',
});

describe('sketch spread selectors', () => {
  beforeEach(() => {
    act(() => {
      useSnapshotStore.setState((s) => {
        s.sketchSpreadGenerateJob = null;
        s.baseSheetGenerateOp = null;
      });
    });
  });

  describe('useIsAnySketchGenerating', () => {
    it('false when neither sketch job is running', () => {
      const { result } = renderHook(() => useIsAnySketchGenerating());
      expect(result.current).toBe(false);
    });

    it('true when the BASE-sheet op is running', () => {
      const { result } = renderHook(() => useIsAnySketchGenerating());
      act(() => {
        useSnapshotStore.setState((s) => {
          // Minimal running base op (only null-ness is read by the selector).
          s.baseSheetGenerateOp = { phase: 'generating' } as never;
        });
      });
      expect(result.current).toBe(true);
    });

    it('true when the SPREAD-image job is running', () => {
      const { result } = renderHook(() => useIsAnySketchGenerating());
      act(() => {
        useSnapshotStore.setState((s) => {
          s.sketchSpreadGenerateJob = spreadJob([{ spreadId: 'a', status: 'running' }]);
        });
      });
      expect(result.current).toBe(true);
    });
  });

  describe('useSketchSpreadGenerating', () => {
    it('idle (not generating) when no job touches the spread', () => {
      const { result } = renderHook(() => useSketchSpreadGenerating('a'));
      expect(result.current).toEqual({ status: 'idle', isGenerating: false, error: undefined });
    });

    it('running for the spread whose task is running', () => {
      const { result } = renderHook(() => useSketchSpreadGenerating('a'));
      act(() => {
        useSnapshotStore.setState((s) => {
          s.sketchSpreadGenerateJob = spreadJob([
            { spreadId: 'a', status: 'running' },
            { spreadId: 'b', status: 'pending' },
          ]);
        });
      });
      expect(result.current).toMatchObject({ status: 'running', isGenerating: true });
    });

    it('surfaces the error message for a failed spread', () => {
      const { result } = renderHook(() => useSketchSpreadGenerating('a'));
      act(() => {
        useSnapshotStore.setState((s) => {
          s.sketchSpreadGenerateJob = spreadJob([{ spreadId: 'a', status: 'error', error: 'nope' }]);
        });
      });
      expect(result.current).toEqual({ status: 'error', isGenerating: false, error: 'nope' });
    });
  });
});
