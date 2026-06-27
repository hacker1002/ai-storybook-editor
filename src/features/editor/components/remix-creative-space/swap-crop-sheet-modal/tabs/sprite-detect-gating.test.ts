// sprite-detect-gating.test.ts — Pure gating + badge logic for the per-sprite
// Check (swap-defect detect) action. Mirrors batch/swap gating coverage.

import { describe, it, expect } from 'vitest';
import type { RemixSprite, DefectSheetResult } from '@/types/remix';
import type { SpriteDetectView } from '@/stores/remix-store';
import {
  evaluateSpriteDetect,
  isSpriteDetectStale,
  summarizeDetectBadge,
  spriteHasSwapResult,
} from './sprite-detect-gating';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Sprite with one sheet; `swapTime` (when set) seeds ONE selected swap_result
 *  carrying a media_url at that created_time. */
function makeSprite(id: string, swapTime?: string): RemixSprite {
  return {
    id,
    order: 0,
    name: 'Sprite',
    swapTask: { state: 'idle' },
    crop_sheets: [
      {
        title: 'Sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: '',
        original_crops: [],
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
  } as unknown as RemixSprite;
}

function sheetResult(count: number, severity: 'low' | 'medium' | 'high'): DefectSheetResult {
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

const idle: SpriteDetectView = { task: { state: 'idle' }, defectsBySheet: [] };
const running: SpriteDetectView = {
  task: { state: 'running', current: 1, total: 2 },
  defectsBySheet: [],
  jobCreatedAt: '2026-06-27T10:00:00Z',
};
function doneView(
  sheets: DefectSheetResult[],
  jobCreatedAt = '2026-06-27T10:00:00Z',
): SpriteDetectView {
  return {
    task: { state: 'done', skippedSheets: 0, errorCount: 0 },
    defectsBySheet: sheets,
    jobCreatedAt,
  };
}

const ctx = {
  submittingDetectSpriteId: null,
  anySpriteSwapRunning: false,
  anyDetectRunning: false,
};

// ── spriteHasSwapResult ──────────────────────────────────────────────────────

describe('spriteHasSwapResult', () => {
  it('false when no swap_results', () => {
    expect(spriteHasSwapResult(makeSprite('s'))).toBe(false);
  });
  it('true when a selected swap_result has media', () => {
    expect(spriteHasSwapResult(makeSprite('s', '2026-06-27T09:00:00Z'))).toBe(true);
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
  it('sums defects and reports highest severity', () => {
    const view = doneView([sheetResult(2, 'low'), sheetResult(3, 'high')]);
    expect(summarizeDetectBadge(view, false)).toEqual({ count: 5, severity: 'high' });
  });
  it('null when stale (defects no longer valid)', () => {
    expect(summarizeDetectBadge(doneView([sheetResult(2, 'low')]), true)).toBeNull();
  });
});

// ── isSpriteDetectStale ──────────────────────────────────────────────────────

describe('isSpriteDetectStale', () => {
  it('false when detect newer than the swap', () => {
    const sprite = makeSprite('s', '2026-06-27T09:00:00Z'); // swap before detect
    expect(isSpriteDetectStale(sprite, doneView([], '2026-06-27T10:00:00Z'))).toBe(false);
  });
  it('true when a re-swap happened AFTER the detect', () => {
    const sprite = makeSprite('s', '2026-06-27T11:00:00Z'); // swap after detect
    expect(isSpriteDetectStale(sprite, doneView([], '2026-06-27T10:00:00Z'))).toBe(true);
  });
  it('false while running (not a done view)', () => {
    expect(isSpriteDetectStale(makeSprite('s', '2026-06-27T11:00:00Z'), running)).toBe(false);
  });
});

// ── evaluateSpriteDetect ─────────────────────────────────────────────────────

describe('evaluateSpriteDetect', () => {
  it('disables Check when the sprite has no swap result', () => {
    const r = evaluateSpriteDetect(makeSprite('s'), idle, ctx);
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Chưa có kết quả swap để kiểm tra');
    expect(r.badge).toBeNull();
  });

  it('enables Check when a swap result exists and nothing is running', () => {
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), idle, ctx);
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('Check');
    expect(r.tooltip).toBe('Kiểm tra lỗi swap (mọi sheet)');
  });

  it('disables every Check while a swap runs', () => {
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      anySpriteSwapRunning: true,
    });
    expect(r.disabled).toBe(true);
  });

  it('disables every Check while another detect runs (dedup 1/remix)', () => {
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      anyDetectRunning: true,
    });
    expect(r.disabled).toBe(true);
    expect(r.tooltip).toBe('Đang kiểm tra một sprite khác');
  });

  it('reports busy + disabled while THIS sprite is being submitted', () => {
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), idle, {
      ...ctx,
      submittingDetectSpriteId: 's',
    });
    expect(r.busy).toBe(true);
    expect(r.disabled).toBe(true);
  });

  it('reports busy while the sprite detect job is running', () => {
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), running, ctx);
    expect(r.busy).toBe(true);
  });

  it('shows the defect badge after a clean done run', () => {
    const view = doneView([sheetResult(4, 'medium')], '2026-06-27T10:00:00Z');
    const sprite = makeSprite('s', '2026-06-27T09:00:00Z'); // swap before detect
    const r = evaluateSpriteDetect(sprite, view, ctx);
    expect(r.label).toBe('Check');
    expect(r.badge).toEqual({ count: 4, severity: 'medium' });
  });

  it('flips to Re-check + hides badge when stale (re-swap after detect)', () => {
    const view = doneView([sheetResult(4, 'high')], '2026-06-27T10:00:00Z');
    const sprite = makeSprite('s', '2026-06-27T11:00:00Z'); // swap after detect
    const r = evaluateSpriteDetect(sprite, view, ctx);
    expect(r.label).toBe('Re-check');
    expect(r.badge).toBeNull();
  });

  it('flips to Re-check on error', () => {
    const errorView: SpriteDetectView = {
      task: { state: 'error', message: 'Detect failed' },
      defectsBySheet: [],
      jobCreatedAt: '2026-06-27T10:00:00Z',
    };
    const r = evaluateSpriteDetect(makeSprite('s', '2026-06-27T09:00:00Z'), errorView, ctx);
    expect(r.label).toBe('Re-check');
  });
});
