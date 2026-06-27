// detect-gating.ts — Pure gating + badge logic for the GENERIC swap-defect Check
// (design 05-15 §4.1). No React / no I/O — generic over any scope with
// `crop_sheets[].swap_results[]` (RemixSprite | RemixStageBatch) so ONE
// evaluator serves both planes (sprite Variants + mix Crops). Kept separate from
// `defect-check-button.tsx` (the component) per react-refresh + the codebase
// convention (cf. `sprite-swap-gating.ts` / `batch-swap-gating.ts`).
//
// SECURITY: operates on counts / severities / timestamps only — NEVER touches
// `defect.message` / media URLs (PII §10).

import type { DetectView } from '@/stores/remix-store';

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 } as const;

/** Per-row Check gate/busy/label + result badge. `label` flips Check↔Re-check
 *  (stale / error). `badge`: an object → `●N` in the highest severity color
 *  (done & >0); `'clean'` → green tick (done & 0); `null` → idle/running/stale. */
export interface DetectActionState {
  disabled: boolean;
  busy: boolean;
  tooltip: string;
  label: string;
  badge: { count: number; severity: 'low' | 'medium' | 'high' } | 'clean' | null;
}

/** Minimal structural shape both planes satisfy (RemixSprite | RemixStageBatch).
 *  `evaluateDetect` only needs swap_result presence + timestamps. */
export interface DetectScopeEntity {
  id: string;
  crop_sheets: ReadonlyArray<{
    swap_results: ReadonlyArray<{
      is_selected: boolean;
      media_url: string | null;
      created_time: string;
      crops?: ReadonlyArray<unknown>;
    }>;
  }>;
}

/** Gating context shared by every Check button — resolved AT THE HOST so the
 *  shared button never calls a plane-specific hook (avoids conditional hooks). */
export interface DetectGateContext {
  /** scopeId currently being POSTed (`=== scope.id` → busy on that row). */
  submittingScopeId: string | null;
  /** Plane swap mutex — sprite: `useAnySpriteSwapRunning`; mix:
   *  `useAnyStageJobRunning(_,'mixes')`. */
  anySwapRunning: boolean;
  /** This plane's detect dedup family is busy — `useAnyDetectRunning(_, jobType)`. */
  anyDetectRunning: boolean;
}

/** A scope is detect-able when ≥1 sheet carries a SELECTED swap result with
 *  media (composed sheet OR crops) — nothing to inspect otherwise (05-15 §8). */
export function scopeHasSwapResult(scope: DetectScopeEntity): boolean {
  return scope.crop_sheets.some((sheet) =>
    sheet.swap_results.some(
      (r) => r.is_selected && (r.media_url != null || (r.crops?.length ?? 0) > 0),
    ),
  );
}

/** Newest SELECTED swap-result time across the scope — the stale-guard anchor
 *  (a re-swap AFTER a detect makes the detect result stale). */
export function latestSelectedSwapTime(scope: DetectScopeEntity): string | null {
  let t: string | null = null;
  for (const sheet of scope.crop_sheets)
    for (const r of sheet.swap_results)
      if (r.is_selected && (t === null || r.created_time > t)) t = r.created_time;
  return t;
}

/** Scope-level stale: the detect ran BEFORE the latest swap → its defects no
 *  longer match the shown result (→ button label flips to "Re-check"). */
export function isDetectStale(scope: DetectScopeEntity, view: DetectView): boolean {
  if (view.task.state !== 'done' || !view.jobCreatedAt) return false;
  const swapTime = latestSelectedSwapTime(scope);
  return swapTime !== null && swapTime > view.jobCreatedAt;
}

/** Result badge: `●N` (sum across sheets, highest-severity color) when done &
 *  >0; `'clean'` when done & 0; `null` while idle/running/error/stale. */
export function summarizeDetectBadge(
  view: DetectView,
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

/** Tooltip per gate state (05-15 §4.1) — generic copy ("một mục khác") so the
 *  same button reads correctly on both planes. */
function detectTooltip(input: {
  hasSwapResult: boolean;
  busy: boolean;
  anySwapRunning: boolean;
  anyDetectRunning: boolean;
}): string {
  if (!input.hasSwapResult) return 'Chưa có kết quả swap để kiểm tra';
  if (input.anySwapRunning) return 'Đang swap — đợi swap xong rồi kiểm tra';
  if (input.busy) return 'Đang kiểm tra…';
  if (input.anyDetectRunning) return 'Đang kiểm tra một mục khác';
  return 'Kiểm tra lỗi swap (mọi sheet)';
}

/** Pure per-row Check evaluator — GENERIC over plane (mirror the swap-action
 *  evaluators). Detect dedups per plane, so `anyDetectRunning` disables EVERY
 *  Check of that plane; the row being checked also shows `busy` (spinner). */
export function evaluateDetect(
  scope: DetectScopeEntity,
  view: DetectView,
  ctx: DetectGateContext,
): DetectActionState {
  const hasSwapResult = scopeHasSwapResult(scope);
  const submitting = ctx.submittingScopeId === scope.id;
  const running = view.task.state === 'running';
  const busy = submitting || running;
  const stale = isDetectStale(scope, view);
  const isError = view.task.state === 'error';
  const disabled =
    !hasSwapResult || ctx.anySwapRunning || ctx.anyDetectRunning || busy;
  return {
    disabled,
    busy,
    label: isError || stale ? 'Re-check' : 'Check',
    tooltip: detectTooltip({
      hasSwapResult,
      busy,
      anySwapRunning: ctx.anySwapRunning,
      anyDetectRunning: ctx.anyDetectRunning,
    }),
    badge: summarizeDetectBadge(view, stale),
  };
}
