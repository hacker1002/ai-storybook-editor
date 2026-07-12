// build-raw-textboxes.ts — Plain builder for the Texts-tab ⭐ Extract (client-side spawn).
// Maps each ExtractedTextbox (content + geometry % in SOURCE image) into a SpreadTextbox appended
// to the current spread's raw_textboxes[] via addRawTextbox.
//
// SIZING: the OCR box only gives a reliable POSITION — its height/width reflect the text as
// rendered in the SOURCE image, at whatever font size that image used. The spawned textbox uses
// the BOOK typography (fixed font size, Validation S1), so its box must be sized for THAT font,
// not the image's. We therefore keep the OCR box top-left as the anchor but recompute W from the
// longest line's char count and H from the wrapped line count, both against the current spread
// canvas dimensions (px). Otherwise a one-line detection yields a ~1%-tall unusable box.
// Exported as a function (not a hook) — the callsite wraps it with useCallback + modal state.

import { createLogger } from '@/utils/logger';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { SpreadImage, SpreadTextbox } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import type { ExtractedTextbox } from '@/features/editor/components/shared-components';

const log = createLogger('Editor', 'buildRawTextboxes');

/** Spread canvas dimensions in px (full bleed canvas — the reference the textbox % + font size
 *  render against; see editor-settings-store canvasSize / ADR-023). */
export interface CanvasPx {
  width: number;
  height: number;
}

// Per-character advance as a fraction of the font size (proportional fonts ≈ 0.5em; 0.6 leaves a
// little slack so text isn't clipped by a too-narrow box). Rough by design — the user fine-tunes.
const CHAR_ADVANCE_RATIO = 0.6;
// Inner padding (horizontal ×2, vertical ×1) as a fraction of the font size.
const BOX_PADDING_RATIO = 0.5;
// Floors so a very short detection still yields a grabbable box (%).
const MIN_BOX_W_PCT = 3;
const MIN_BOX_H_PCT = 2.5;
// Keep a small margin from the spread's right/bottom edge (%).
const EDGE_MARGIN_PCT = 1;
// Defensive fallbacks if the canvas isn't hydrated yet (avoid div-by-zero → Infinity).
const FALLBACK_CANVAS_W = 1000;
const FALLBACK_CANVAS_H = 700;

/**
 * Approximate a raw_textbox size from its text + font + spread canvas, anchored at (x, y) %.
 * Rough on purpose (no glyph measuring): width ≈ avg char advance × longest-line char count,
 * height ≈ line count × line height × font size. Both → % of the spread canvas; the box is capped
 * to the spread and the anchor is clamped so it stays fully on-page. The user fine-tunes after.
 */
export function estimateTextboxGeometry(
  content: string,
  fontSizePx: number,
  lineHeight: number,
  canvas: CanvasPx,
  anchorX: number,
  anchorY: number,
): { x: number; y: number; w: number; h: number; rotation: number } {
  const cw = canvas.width > 0 ? canvas.width : FALLBACK_CANVAS_W;
  const ch = canvas.height > 0 ? canvas.height : FALLBACK_CANVAS_H;
  const size = fontSizePx > 0 ? fontSizePx : (DEFAULT_TYPOGRAPHY.size ?? 18);
  const lh = lineHeight > 0 ? lineHeight : 1.5;

  const lines = content.split('\n');
  const lineCount = Math.max(1, lines.length);
  const longestChars = Math.max(1, ...lines.map((l) => l.length));
  const paddingPx = size * BOX_PADDING_RATIO;

  // width ≈ avg char advance × longest-line char count (+ padding), capped to the spread.
  const widthPx = longestChars * size * CHAR_ADVANCE_RATIO + paddingPx * 2;
  const maxWidthPct = 100 - EDGE_MARGIN_PCT * 2;
  const w = Math.min(maxWidthPct, Math.max(MIN_BOX_W_PCT, (widthPx / cw) * 100));

  // height ≈ line count × line height × font size (+ padding).
  const heightPx = lineCount * size * lh + paddingPx;
  const h = Math.max(MIN_BOX_H_PCT, (heightPx / ch) * 100);

  // Clamp the anchor so the text-sized box stays fully on the spread.
  const x = Math.min(Math.max(anchorX, 0), Math.max(0, 100 - w));
  const y = Math.min(Math.max(anchorY, 0), Math.max(0, 100 - h));
  return { x, y, w, h, rotation: 0 };
}

/**
 * Spawn N raw_textboxes from committed Texts-tab specs.
 * - position: OCR box top-left mapped into the source footprint (spread-relative %);
 * - size: derived from content + book font size + spread canvas (see estimateTextboxGeometry);
 * - typography: book default for the current language (size + family + style) — user tweaks per box;
 * - player_visible:false / editor_visible:true (raw textbox is editor-only); rotation:0 (v1 axis-aligned).
 */
export function buildRawTextboxes(
  specs: ExtractedTextbox[],
  sourceImage: SpreadImage,
  spreadId: string,
  langCode: string,
  canvas: CanvasPx,
  addRawTextbox: (spreadId: string, textbox: SpreadTextbox) => void,
  bookTypography?: Record<string, TypographySettings> | null,
): void {
  const orig = sourceImage.geometry;
  // Reuse NGUYÊN (incl. size) — no box-height→font heuristic (Validation S1).
  const typography = mapTypographyToTextbox(bookTypography?.[langCode] ?? DEFAULT_TYPOGRAPHY);
  const fontSizePx = typography.size ?? DEFAULT_TYPOGRAPHY.size ?? 18;
  const lineHeight = typography.lineHeight ?? 1.5;

  for (const spec of specs) {
    const box = spec.geometry;
    // Anchor = OCR box top-left mapped into the source image footprint (position only).
    const anchorX = orig.x + (box.x / 100) * orig.w;
    const anchorY = orig.y + (box.y / 100) * orig.h;
    const geometry = estimateTextboxGeometry(spec.content, fontSizePx, lineHeight, canvas, anchorX, anchorY);

    // Collapse whitespace (multi-line OCR content) into single spaces so the layer title stays
    // one clean line; the full multi-line content is preserved on the language block below.
    const title = spec.content.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Text';
    addRawTextbox(spreadId, {
      id: crypto.randomUUID(),
      title,
      player_visible: false,
      editor_visible: true,
      [langCode]: { text: spec.content, geometry, typography },
    });
  }

  // ⚠️ never log OCR content (PII) — count + spread only.
  log.info('buildRawTextboxes', 'spawned raw textboxes', {
    count: specs.length,
    spreadId,
    langCode,
    fontSizePx,
    canvasW: canvas.width,
    canvasH: canvas.height,
  });
}
