// typography-apply-slice.ts — cross-cutting "Force Apply" engine.
//
// Pushes a step's per-language book typography (book.typography[step][lang])
// down onto every textbox of that step + language. This slice reads two domains
// (state.sketch + state.illustration) depending on `step`, so it lives on its
// own rather than being wedged into a single-domain slice.

import type { StateCreator } from 'zustand';
import type { SnapshotStore, TypographyApplySlice } from '../types';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'TypographyApplySlice');

/**
 * A textbox entry is language content — not a meta key (id/title/z-index/
 * player_visible/…) — when it is a non-null object carrying both geometry and
 * typography. Works for SketchTextbox and SpreadTextbox alike.
 */
function isTextboxContent(
  value: unknown,
): value is { typography: unknown; geometry: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'geometry' in value &&
    'typography' in value
  );
}

/**
 * Force Apply — override ONLY the typography block on every textbox of the given
 * step + language (text/geometry/audio preserved). Skips textboxes lacking the
 * target language entry (no new-language seeding — Validation S1). Converts the
 * snake_case book TypographySettings → camelCase canvas Typography before write.
 * Idempotent; sets `sync.isDirty` so the debounced flusher persists in one pass.
 *
 * step → target textbox array:
 *   sketch       → state.sketch.spreads[].textboxes[]
 *   illustration → state.illustration.spreads[].raw_textboxes[]
 *   retouch      → state.illustration.spreads[].textboxes[]
 */
export const createTypographyApplySlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  TypographyApplySlice
> = (set) => ({
  applyTypographyToStepTextboxes: (step, lang, typo) =>
    set((state) => {
      const camel = mapTypographyToTextbox(typo);

      // Gather the target textbox draft arrays for this step.
      const boxes: Array<Record<string, unknown>> = [];
      let spreadCount = 0;
      if (step === 'sketch') {
        for (const spread of state.sketch?.spreads ?? []) {
          spreadCount++;
          for (const tb of spread.textboxes ?? []) {
            boxes.push(tb as unknown as Record<string, unknown>);
          }
        }
      } else {
        const field = step === 'illustration' ? 'raw_textboxes' : 'textboxes';
        for (const spread of state.illustration?.spreads ?? []) {
          spreadCount++;
          const arr = (spread as unknown as Record<string, unknown>)[field] as
            | Array<Record<string, unknown>>
            | undefined;
          for (const tb of arr ?? []) boxes.push(tb);
        }
      }

      let count = 0;
      for (const tb of boxes) {
        const content = tb[lang];
        if (isTextboxContent(content)) {
          // Override the typography block only; keep text/geometry/audio.
          (content as { typography: unknown }).typography = { ...camel };
          count++;
        }
      }

      state.sync.isDirty = true;
      log.debug('applyTypographyToStepTextboxes', 'scanned', { step, lang, spreadCount });
      log.info('applyTypographyToStepTextboxes', 'applied', { step, lang, count });
    }),
});
