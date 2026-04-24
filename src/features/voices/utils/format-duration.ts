/**
 * Format seconds → M:SS (e.g., 12 → "0:12", 75 → "1:15").
 * NaN / negatives clamp to 0.
 */
export function formatDuration(secs: number): string {
  const safe = Number.isFinite(secs) ? secs : 0;
  const total = Math.max(0, Math.round(safe));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
