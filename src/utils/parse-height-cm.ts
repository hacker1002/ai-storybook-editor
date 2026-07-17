// parse-height-cm.ts — free-text height → a number of CENTIMETRES (single source).
//
// Shared by the Excel import parser (`parse-base-entities`) and the read-time snapshot migrate
// (`coerceVariant`), so a legacy string blob and a fresh import land on the exact same number.
//
// Rules (design phase-01; ported from the Python skill's `_HEIGHT_NUM_RE` / `_PARENS_RE`):
//  - already a number → round + clamp (IDEMPOTENT — re-parsing stored data must not drift)
//  - metre unit ("1.1m", "1,1 m") → ×100; "cm"/plain ("110cm", "110") → as-is
//  - a RANGE takes the MAX ("20-30cm" → 30) — the tallest/longest extent
//  - parenthesised text is CONTEXT, not the measurement: "0.55 m (bộ giáp, bé 1.05 m)" → 55
//  - unparseable / empty / ≤0 → null (the caller decides whether that deserves a warning)
//
// NOTE: the decimal group in the number regex is load-bearing — a bare \d+ reads "1.5m" as TWO
// numbers and would mistake a single height for a range (picking 5 as the max).

// Each number PLUS the unit written immediately after it. The unit must bind to its own number:
// a whole-string `m` test reads the `m` of ordinary vi-VN words ("mở", "mỗi", "mẫu") as the metre
// unit, so "cao 120cm khi mở rộng" would silently ×100 → clamp → 5000.
// The trailing (?![\p{L}]) is what keeps "110 mỗi bên" from binding the `m` of "mỗi" as a unit.
const HEIGHT_MEASURE_RE = /(\d+(?:[.,]\d+)?)\s*(cm|mét|met|m)?(?![\p{L}])/giu;
/** Parenthesised spans — stripped BEFORE number extraction (context, not the size). */
const PARENS_RE = /\([^)]*\)/g;
/** Units meaning metres (→ ×100). Anything else, incl. a bare number, is already cm. */
const METER_UNITS = new Set(['m', 'mét', 'met']);

/** Canonical height bounds (cm). Single source for parsing AND edit-modal validation. */
export const HEIGHT_CM_MIN = 1;
export const HEIGHT_CM_MAX = 5000;

const MIN_CM = HEIGHT_CM_MIN;
const MAX_CM = HEIGHT_CM_MAX;

/** Round + clamp a positive cm value into [1, 5000]; non-finite / ≤0 → null. */
function normalizeCm(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_CM, Math.max(MIN_CM, Math.round(value)));
}

/**
 * Parse a raw height cell / stored value into centimetres.
 *
 * @param raw  a number (already-migrated data), a free-text string, or anything else
 * @returns    integer cm in [1, 5000], or null when nothing measurable was found
 */
export function parseHeightCm(raw: unknown): number | null {
  if (typeof raw === 'number') return normalizeCm(raw);
  if (typeof raw !== 'string') return null;

  const stripped = raw.replace(PARENS_RE, ' ').trim();
  if (!stripped) return null;

  // Convert EACH measurement to cm using its OWN adjacent unit, then compare.
  const centimetres: number[] = [];
  for (const [, digits, unit] of stripped.matchAll(HEIGHT_MEASURE_RE)) {
    const value = Number(digits.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    centimetres.push(METER_UNITS.has(unit?.toLowerCase() ?? '') ? value * 100 : value);
  }
  if (centimetres.length === 0) return null;

  // Range → the MAX end (a coiled rope / folding chair is measured at its longest).
  // Compared in cm, so a mixed "1.1m - 50cm" ranks 110 over 50 rather than 1.1 over 50.
  return normalizeCm(Math.max(...centimetres));
}
