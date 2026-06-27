// sprite-detect-gating.ts — Pure gating + badge helpers for the per-sprite
// Check (swap-defect detect) action (design 05-15 §3.1). Mirror of
// `sprite-swap-gating.ts` on the detect plane. No React, no I/O — keeps
// VariantsTab lean + unit-testable.
//
// SECURITY: operates on counts / severities / timestamps only — never touches
// `defect.message` / media URLs (PII §10).

import type { RemixSprite } from '@/types/remix';
import type { SpriteDetectView } from '@/stores/remix-store';
import type { DetectActionState } from './sprites-sidebar';

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 } as const;

/** A sprite is detect-able when ≥1 sheet carries a SELECTED swap result with
 *  media (composed sheet or crops) — nothing to inspect otherwise (05-15 §8). */
export function spriteHasSwapResult(sprite: RemixSprite): boolean {
  return sprite.crop_sheets.some((sheet) =>
    sheet.swap_results.some(
      (r) => r.is_selected && (r.media_url != null || (r.crops?.length ?? 0) > 0),
    ),
  );
}

/** Newest SELECTED swap-result time across the sprite — the stale-guard anchor
 *  (a re-swap AFTER a detect makes the detect result stale). */
export function latestSelectedSwapTime(sprite: RemixSprite): string | null {
  let t: string | null = null;
  for (const sheet of sprite.crop_sheets)
    for (const r of sheet.swap_results)
      if (r.is_selected && (t === null || r.created_time > t)) t = r.created_time;
  return t;
}

/** Sprite-level stale: the detect ran BEFORE the latest swap → its defects no
 *  longer match the shown result (→ button label flips to "Re-check"). */
export function isSpriteDetectStale(
  sprite: RemixSprite,
  view: SpriteDetectView,
): boolean {
  if (view.task.state !== 'done' || !view.jobCreatedAt) return false;
  const swapTime = latestSelectedSwapTime(sprite);
  return swapTime !== null && swapTime > view.jobCreatedAt;
}

/** Result badge: `●N` (sum across sheets, highest-severity color) when done &
 *  >0; `'clean'` when done & 0; `null` while idle/running/error/stale. */
export function summarizeDetectBadge(
  view: SpriteDetectView,
  stale: boolean,
): DetectActionState['badge'] {
  if (view.task.state !== 'done' || stale) return null;
  let count = 0;
  let severity: 'low' | 'medium' | 'high' = 'low';
  for (const sheet of view.defectsBySheet) {
    count += sheet.defectCount ?? sheet.defects.length;
    for (const d of sheet.defects) {
      const sev = d.severity ?? 'low';
      if (SEVERITY_RANK[sev] > SEVERITY_RANK[severity]) severity = sev;
    }
  }
  return count === 0 ? 'clean' : { count, severity };
}

/** Gating context shared by every Check button (the remix-wide mutexes). */
export interface DetectGateContext {
  submittingDetectSpriteId: string | null;
  anySpriteSwapRunning: boolean;
  anyDetectRunning: boolean;
}

/** Tooltip per gate state (05-15 §3.1). */
function detectTooltip(input: {
  hasSwapResult: boolean;
  busy: boolean;
  anySpriteSwapRunning: boolean;
  anyDetectRunning: boolean;
}): string {
  if (!input.hasSwapResult) return 'Chưa có kết quả swap để kiểm tra';
  if (input.anySpriteSwapRunning) return 'Đang swap — đợi swap xong rồi kiểm tra';
  if (input.busy) return 'Đang kiểm tra…';
  if (input.anyDetectRunning) return 'Đang kiểm tra một sprite khác';
  return 'Kiểm tra lỗi swap (mọi sheet)';
}

/** Pure per-row Check evaluator (mirror `evaluateSpriteAction` for swap). Detect
 *  dedups to 1 per remix, so `anyDetectRunning` disables EVERY Check; the row
 *  being checked also shows `busy` (spinner). */
export function evaluateSpriteDetect(
  sprite: RemixSprite,
  view: SpriteDetectView,
  ctx: DetectGateContext,
): DetectActionState {
  const hasSwapResult = spriteHasSwapResult(sprite);
  const submitting = ctx.submittingDetectSpriteId === sprite.id;
  const running = view.task.state === 'running';
  const busy = submitting || running;
  const stale = isSpriteDetectStale(sprite, view);
  const isError = view.task.state === 'error';
  const disabled =
    !hasSwapResult || ctx.anySpriteSwapRunning || ctx.anyDetectRunning || busy;
  return {
    disabled,
    busy,
    label: isError || stale ? 'Re-check' : 'Check',
    tooltip: detectTooltip({
      hasSwapResult,
      busy,
      anySpriteSwapRunning: ctx.anySpriteSwapRunning,
      anyDetectRunning: ctx.anyDetectRunning,
    }),
    badge: summarizeDetectBadge(view, stale),
  };
}
