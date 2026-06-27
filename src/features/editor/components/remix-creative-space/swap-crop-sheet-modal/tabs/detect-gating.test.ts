// detect-gating.test.ts — Pure gating + badge logic for the GENERIC swap-defect
// Check (`evaluateDetect`), covering BOTH planes (sprite Variants + mix Crops).
// Generalized from the former `sprite-detect-gating.test.ts` — the same logic now
// drives both planes via `DETECT_PLANE_CONFIG`; this protects the sprite behavior
// 1:1 AND the new mix plane against regression.

import { describe, it, expect } from 'vitest';
import type { DefectSheetResult } from '@/types/remix';
import type { DetectView } from '@/stores/remix-store';
import {
  evaluateDetect,
  isDetectStale,
  summarizeDetectBadge,
  scopeHasSwapResult,
  type DetectScopeEntity,
} from './detect-gating';

// ── Fixtures (generic — one shape serves sprite scopes AND mix batches) ───────

/** A detect scope (sprite | batch) with one sheet; `swapTime` (when set) seeds
 *  ONE selected swap_result carrying media at that created_time. */
function makeScope(id: string, swapTime?: string): DetectScopeEntity {
  return {
    id,
    crop_sheets: [
      {
        swap_results: swapTime
          ? [
              {
                media_url: 'https://cdn/s.png',
                created_time: swapTime,
                is_selected: true,
                crops: [],
              },
            ]
          : [],
      },
    ],
  };
}

function sheetResult(
  count: number,
  severity: 'low' | 'medium' | 'high',
): DefectSheetResult {
  return {
    sheet_index: 0,
    defects: Array.from({ length: count }, () => ({
      center: { x: 1, y: 1 },
      radius: 1,
      severity,
    })),
    swappedDimensions: { width: 100, height: 100 },
    defectCount: count,
  };
}

const idle: DetectView = { task: { state: 'idle' }, defectsBySheet: [] };
const running: DetectView = {
  task: { state: 'running', current: 1, total: 2 },
  defectsBySheet: [],
  jobCreatedAt: '2026-06-27T10:00:00Z',
};
function doneView(
  sheets: DefectSheetResult[],
  jobCreatedAt = '2026-06-27T10:00:00Z',
): DetectView {
  return {
    task: { state: 'done', skippedSheets: 0, errorCount: 0 },
    defectsBySheet: sheets,
    jobCreatedAt,
  };
}

const ctx = {
  submittingScopeId: null,
  anySwapRunning: false,
  anyDetectRunning: false,
};

// ── scopeHasSwapResult ───────────────────────────────────────────────────────

describe('scopeHasSwapResult', () => {
  it('false when no swap_results', () => {
    expect(scopeHasSwapResult(makeScope('s'))).toBe(false);
  });
  it('true when a selected swap_result has media', () => {
    expect(scopeHasSwapResult(makeScope('s', '2026-06-27T09:00:00Z'))).toBe(true);
  });
  it('true when a selected swap_result has crops but no media_url (upscale-like)', () => {
    const scope: DetectScopeEntity = {
      id: 's',
      crop_sheets: [
        {
          swap_results: [
            {
              media_url: null,
              created_time: '2026-06-27T09:00:00Z',
              is_selected: true,
              crops: [{}],
            },
          ],
        },
      ],
    };
    expect(scopeHasSwapResult(scope)).toBe(true);
  });
});

// ── summarizeDetectBadge ─────────────────────────────────────────────────────

describe('summarizeDetectBadge', () => {
  it('null while not done', () => {
    expect(summarizeDetectBadge(running, false)).toBeNull();
  });
  it("'clean' when done with zero defects", () => {
    expect(summarizeDetectBadge(doneView([]), false)).toBe('clean');
  });
  it('sums defects across sheets and reports highest severity', () => {
    const view = doneView([sheetResult(2, 'low'), sheetResult(3, 'high')]);
    expect(summarizeDetectBadge(view, false)).toEqual({ count: 5, severity: 'high' });
  });
  it('null when stale (defects no longer valid)', () => {
    expect(summarizeDetectBadge(doneView([sheetResult(2, 'low')]), true)).toBeNull();
  });
});

// ── isDetectStale ────────────────────────────────────────────────────────────

describe('isDetectStale', () => {
  it('false when detect newer than the swap', () => {
    const scope = makeScope('s', '2026-06-27T09:00:00Z'); // swap before detect
    expect(isDetectStale(scope, doneView([], '2026-06-27T10:00:00Z'))).toBe(false);
  });
  it('true when a re-swap happened AFTER the detect', () => {
    const scope = makeScope('s', '2026-06-27T11:00:00Z'); // swap after detect
    expect(isDetectStale(scope, doneView([], '2026-06-27T10:00:00Z'))).toBe(true);
  });
  it('false while running (not a done view)', () => {
    expect(isDetectStale(makeScope('s', '2026-06-27T11:00:00Z'), running)).toBe(false);
  });
});

// ── evaluateDetect — SPRITE plane (1:1 with the former sprite gating) ─────────

describe('evaluateDetect (sprite plane)', () => {
  it('disables Check when the scope has no swap result', () => {
    const r = evaluateDetect(makeScope('s'), idle, ctx);
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Chưa có kết quả swap để kiểm tra');
    expect(r.badge).toBeNull();
  });

  it('enables Check when a swap result exists and nothing is running', () => {
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), idle, ctx);
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('Check');
    expect(r.tooltip).toBe('Kiểm tra lỗi swap (mọi sheet)');
  });

  it('disables every Check while a swap runs (anySwapRunning)', () => {
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      anySwapRunning: true,
    });
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Đang swap — đợi swap xong rồi kiểm tra');
  });

  it('disables every Check while another detect runs (dedup — generic copy)', () => {
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      anyDetectRunning: true,
    });
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Đang kiểm tra một mục khác');
  });

  it('reports busy + disabled while THIS scope is being submitted', () => {
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      submittingScopeId: 's',
    });
    expect(r.busy).toBe(true);
    expect(r.disabled).toBe(true);
  });

  it('reports busy while the detect job is running', () => {
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), running, ctx);
    expect(r.busy).toBe(true);
  });

  it('shows the defect badge after a clean done run', () => {
    const view = doneView([sheetResult(4, 'medium')], '2026-06-27T10:00:00Z');
    const scope = makeScope('s', '2026-06-27T09:00:00Z'); // swap before detect
    const r = evaluateDetect(scope, view, ctx);
    expect(r.label).toBe('Check');
    expect(r.badge).toEqual({ count: 4, severity: 'medium' });
  });

  it('flips to Re-check + hides badge when stale (re-swap after detect)', () => {
    const view = doneView([sheetResult(4, 'high')], '2026-06-27T10:00:00Z');
    const scope = makeScope('s', '2026-06-27T11:00:00Z'); // swap after detect
    const r = evaluateDetect(scope, view, ctx);
    expect(r.label).toBe('Re-check');
    expect(r.badge).toBeNull();
  });

  it('flips to Re-check on error', () => {
    const errorView: DetectView = {
      task: { state: 'error', message: 'Detect failed' },
      defectsBySheet: [],
      jobCreatedAt: '2026-06-27T10:00:00Z',
    };
    const r = evaluateDetect(makeScope('s', '2026-06-27T09:00:00Z'), errorView, ctx);
    expect(r.label).toBe('Re-check');
  });
});

// ── evaluateDetect — MIX plane (same logic; independent dedup family) ─────────

describe('evaluateDetect (mix plane — batch scope)', () => {
  it('disables Check when the batch has no swap result', () => {
    const r = evaluateDetect(makeScope('batch-1'), idle, ctx);
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Chưa có kết quả swap để kiểm tra');
  });

  it('enables Check on a swapped batch when nothing is running', () => {
    const r = evaluateDetect(makeScope('batch-1', '2026-06-27T09:00:00Z'), idle, ctx);
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('Check');
  });

  it('mix detect runs independently — sprite-swap-running does NOT gate it when the host passes anySwapRunning=false', () => {
    // The host resolves anySwapRunning per plane (mix: useAnyStageJobRunning
    // ('mixes')); a sprite swap is NOT the mix mutex → mix Check stays enabled.
    const r = evaluateDetect(makeScope('batch-1', '2026-06-27T09:00:00Z'), idle, {
      submittingScopeId: null,
      anySwapRunning: false,
      anyDetectRunning: false,
    });
    expect(r.disabled).toBe(false);
  });

  it('disables when a mix swap is running for THIS plane (anySwapRunning=true)', () => {
    const r = evaluateDetect(makeScope('batch-1', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      anySwapRunning: true,
    });
    expect(r.disabled).toBe(true);
  });

  it('badge sums multi-sheet mix defects (multi-subject crops)', () => {
    const view = doneView(
      [sheetResult(3, 'high'), sheetResult(2, 'medium')],
      '2026-06-27T10:00:00Z',
    );
    const r = evaluateDetect(makeScope('batch-1', '2026-06-27T09:00:00Z'), view, ctx);
    expect(r.badge).toEqual({ count: 5, severity: 'high' });
  });
});
