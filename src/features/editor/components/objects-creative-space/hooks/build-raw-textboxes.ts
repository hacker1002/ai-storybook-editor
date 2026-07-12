// build-raw-textboxes.ts — Plain builder for the Texts-tab ⭐ Extract (client-side spawn).
// Maps each ExtractedTextbox (content + geometry % in SOURCE image) into a SpreadTextbox appended
// to the current spread's raw_textboxes[] via addRawTextbox. Geometry compose mirrors
// buildExtractImages (box % within the source footprint → spread-relative %). Typography comes
// from the book default (Validation S1) — font size is NOT inferred from box height.
// Exported as a function (not a hook) — the callsite wraps it with useCallback + modal state.

import { createLogger } from '@/utils/logger';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { SpreadImage, SpreadTextbox } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import type { ExtractedTextbox } from '@/features/editor/components/shared-components';

const log = createLogger('Editor', 'buildRawTextboxes');

/**
 * Spawn N raw_textboxes from committed Texts-tab specs.
 * - geometry: box % within the source image footprint → spread-relative % (clamped 99/100 —
 *   parity with buildExtractImages so a text box never lands off-spread).
 * - typography: book default for the current language (size + family + style) — user tweaks per box.
 * - player_visible:false / editor_visible:true (raw textbox is editor-only); rotation:0 (v1 axis-aligned).
 */
export function buildRawTextboxes(
  specs: ExtractedTextbox[],
  sourceImage: SpreadImage,
  spreadId: string,
  langCode: string,
  addRawTextbox: (spreadId: string, textbox: SpreadTextbox) => void,
  bookTypography?: Record<string, TypographySettings> | null,
): void {
  const orig = sourceImage.geometry;
  // Reuse NGUYÊN (incl. size) — no box-height heuristic (Validation S1).
  const typography = mapTypographyToTextbox(bookTypography?.[langCode] ?? DEFAULT_TYPOGRAPHY);

  for (const spec of specs) {
    const box = spec.geometry;
    const geometry = {
      x: Math.min(orig.x + (box.x / 100) * orig.w, 99),
      y: Math.min(orig.y + (box.y / 100) * orig.h, 99),
      w: Math.min((box.w / 100) * orig.w, 100),
      h: Math.min((box.h / 100) * orig.h, 100),
      rotation: 0,
    };
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
  log.info('buildRawTextboxes', 'spawned raw textboxes', { count: specs.length, spreadId, langCode });
}
