// lineup-scale-math.ts — PURE scale math + layout constants for the Lineup canvas
// (design 02 §2.3/§2.5, README §4.3). DOM-free ON PURPOSE: everything the canvas needs is derived
// from `entries` + the MEASURED stage height, so the math stays unit-testable without a renderer.
//
// The one shared ruler is what makes the lineup honest: EVERY crop is scaled by the SAME `pxPerCm`,
// so a 5 cm prop next to a 3 m character renders tiny — that is CORRECT, never clamp it to a
// min-size (that would silently lie about the scale — README §4.3).

import type { LineupEntry } from '@/types/sketch';

export const LINEUP_LAYOUT = {
  /** Strip below the baseline holding the 2 staggered mention rows — subtracted from usableH. */
  labelStripPx: 56,
  /** Breathing room above the topmost ruler line — subtracted from usableH. */
  topPaddingPx: 24,
  /** Horizontal gap between crops. */
  cropGapPx: 32,
  /** Stage padding left/right of the crop row. */
  sidePaddingPx: 48,
  /** Odd-index mentions drop by this much so neighbouring labels never collide. */
  labelStaggerPx: 20,
  /** One ruler line every 0.5 m; the scale always tops out on a multiple of it. */
  rulerStepMeters: 0.5,
  /** Nothing selected → the ruler STILL renders at this scale (never blank — design §2.6). */
  defaultTopMeters: 2,
} as const;

/**
 * Zoom slider step for this space: 25 (design 02 §2.5) — deliberately coarser than the shared
 * sheet-space `ZOOM.step` (5), whose bounds (25–200) we do reuse.
 */
export const LINEUP_ZOOM_STEP = 25;

export interface LineupRulerLine {
  /** 0.5, 1, … topMeters */
  meters: number;
  /** Distance from the stage top, in px — CSS `top` of the dashed line. */
  y: number;
}

export interface LineupScale {
  /** Ruler ceiling in metres — a multiple of 0.5 covering the tallest entry. */
  topMeters: number;
  /** THE shared scale. 0 while the stage is still unmeasured (first mount) — see below. */
  pxPerCm: number;
  /** Drawable height between the top padding and the baseline. */
  usableHeightPx: number;
  /** Distance from the stage top to the baseline, in px — crops bottom-align here. */
  baselineY: number;
  lines: LineupRulerLine[];
}

/** Kill float dust before `ceil` (e.g. 1.1/0.5 = 2.2000000000000006 → would ceil to 3 correctly, but 3/0.5 = 5.999999 must not ceil to 6). */
const ceilSteps = (value: number): number => Math.ceil(Number(value.toFixed(6)));

/** Round to 2dp so `3 × 0.5` style accumulation never leaks 1.5000000000000002 into a label. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Ruler ceiling: the tallest entry rounded UP to a multiple of 0.5 m (min 0.5 m).
 * No entries → the default 2 m scale (README §4.3).
 */
export function computeTopMeters(entries: readonly LineupEntry[]): number {
  if (entries.length === 0) return LINEUP_LAYOUT.defaultTopMeters;

  const step = LINEUP_LAYOUT.rulerStepMeters;
  let maxCm = 0;
  for (const entry of entries) {
    if (entry.heightCm != null && entry.heightCm > maxCm) maxCm = entry.heightCm;
  }
  // maxCm <= 0 (heights missing/absurd) still yields a drawable one-step ruler rather than 0.
  if (maxCm <= 0) return step;

  return round2(Math.max(step, ceilSteps(maxCm / 100 / step) * step));
}

/**
 * Derive the whole canvas geometry from the entries + the measured stage height.
 *
 * `stageHeightPx` is 0 on first mount (pre-ResizeObserver) → `usableHeightPx`/`pxPerCm` collapse to
 * 0 rather than going negative, and the caller simply re-derives once the observer fires. Division
 * is safe by construction: `topMeters >= 0.5` ⇒ the denominator is >= 50, never 0.
 */
export function computeLineupScale(
  entries: readonly LineupEntry[],
  stageHeightPx: number,
): LineupScale {
  const stageH = Number.isFinite(stageHeightPx) ? stageHeightPx : 0;
  const topMeters = computeTopMeters(entries);

  const usableHeightPx = Math.max(
    0,
    stageH - LINEUP_LAYOUT.labelStripPx - LINEUP_LAYOUT.topPaddingPx,
  );
  const pxPerCm = usableHeightPx / (topMeters * 100);
  const baselineY = Math.max(0, stageH - LINEUP_LAYOUT.labelStripPx);

  const lineCount = Math.round(topMeters / LINEUP_LAYOUT.rulerStepMeters);
  const lines: LineupRulerLine[] = [];
  for (let i = 1; i <= lineCount; i++) {
    const meters = round2(i * LINEUP_LAYOUT.rulerStepMeters);
    lines.push({ meters, y: baselineY - meters * 100 * pxPerCm });
  }

  return { topMeters, pxPerCm, usableHeightPx, baselineY, lines };
}

/** Crop height on the shared scale. Width is NEVER computed — the img keeps its natural ratio. */
export function imageHeightPx(entry: LineupEntry, pxPerCm: number): number {
  return (entry.heightCm ?? 0) * pxPerCm;
}
