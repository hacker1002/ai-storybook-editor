import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createTypographyApplySlice } from './typography-apply-slice';
import type { TypographySettings } from '@/types/editor';

// Isolated harness: the Force Apply slice + only the cross-slice fields its action
// reads/writes (sketch.spreads, illustration.spreads, sync.isDirty). Avoids pulling
// the full store (and supabase client) into a unit test.
/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore(initial: { sketch?: any; illustration?: any }) {
  return create<any>()(
    immer((...a: any[]) => ({
      ...(createTypographyApplySlice as any)(...a),
      sketch: initial.sketch ?? { spreads: [] },
      illustration: initial.illustration ?? { spreads: [] },
      sync: { isDirty: false },
    })),
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// snake_case book typography with distinctive values → verify snake→camel mapping.
const TYPO: TypographySettings = {
  size: 24,
  weight: 700,
  style: 'italic',
  family: 'Poppins',
  color: '#FF0000',
  line_height: 2,
  letter_spacing: 3,
  decoration: 'underline',
  text_align: 'center',
  text_transform: 'uppercase',
};

// A per-language textbox content (camelCase typography, as stored on the canvas).
const content = (text: string) => ({
  text,
  geometry: { x: 1, y: 2, w: 3, h: 4 },
  typography: {
    family: 'Nunito',
    size: 18,
    weight: 400,
    style: 'normal',
    color: '#000000',
    lineHeight: 1.5,
    letterSpacing: 0,
    decoration: 'none',
    textAlign: 'left',
    textTransform: 'none',
  },
});

describe('applyTypographyToStepTextboxes', () => {
  it('sketch: overrides only textboxes that have the target lang; skips missing-lang', () => {
    const store = createTestStore({
      sketch: {
        spreads: [
          { id: 'sp1', textboxes: [{ id: 'tb1', en_US: content('hi'), vi_VN: content('chao') }] },
          { id: 'sp2', textboxes: [{ id: 'tb2', vi_VN: content('chao2') }] }, // no en_US
        ],
      },
    });

    store.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);
    const s = store.getState();

    // tb1.en_US typography overridden (snake→camel), text + geometry preserved.
    const tb1 = s.sketch.spreads[0].textboxes[0];
    expect(tb1.en_US.typography).toEqual({
      family: 'Poppins',
      size: 24,
      weight: 700,
      style: 'italic',
      color: '#FF0000',
      lineHeight: 2,
      letterSpacing: 3,
      decoration: 'underline',
      textAlign: 'center',
      textTransform: 'uppercase',
    });
    expect(tb1.en_US.text).toBe('hi');
    expect(tb1.en_US.geometry).toEqual({ x: 1, y: 2, w: 3, h: 4 });

    // tb1.vi_VN untouched (different lang).
    expect(tb1.vi_VN.typography.family).toBe('Nunito');
    // tb2 has no en_US → not seeded, not touched.
    const tb2 = s.sketch.spreads[1].textboxes[0];
    expect(tb2.en_US).toBeUndefined();
    expect(tb2.vi_VN.typography.family).toBe('Nunito');
  });

  it('illustration: only raw_textboxes change, retouch textboxes untouched', () => {
    const store = createTestStore({
      illustration: {
        spreads: [
          {
            id: 'sp1',
            raw_textboxes: [{ id: 'r1', en_US: content('raw') }],
            textboxes: [{ id: 't1', en_US: content('play') }],
          },
        ],
      },
    });

    store.getState().applyTypographyToStepTextboxes('illustration', 'en_US', TYPO);
    const sp = store.getState().illustration.spreads[0];

    expect(sp.raw_textboxes[0].en_US.typography.family).toBe('Poppins');
    expect(sp.textboxes[0].en_US.typography.family).toBe('Nunito'); // retouch untouched
  });

  it('retouch: only textboxes change, raw_textboxes untouched', () => {
    const store = createTestStore({
      illustration: {
        spreads: [
          {
            id: 'sp1',
            raw_textboxes: [{ id: 'r1', en_US: content('raw') }],
            textboxes: [{ id: 't1', en_US: content('play') }],
          },
        ],
      },
    });

    store.getState().applyTypographyToStepTextboxes('retouch', 'en_US', TYPO);
    const sp = store.getState().illustration.spreads[0];

    expect(sp.textboxes[0].en_US.typography.family).toBe('Poppins');
    expect(sp.raw_textboxes[0].en_US.typography.family).toBe('Nunito'); // raw untouched
  });

  it('is idempotent (second apply is deep-equal to first)', () => {
    const seed = () =>
      createTestStore({
        sketch: { spreads: [{ id: 'sp1', textboxes: [{ id: 'tb1', en_US: content('hi') }] }] },
      });

    const once = seed();
    once.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);
    const twice = seed();
    twice.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);
    twice.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);

    expect(twice.getState().sketch).toEqual(once.getState().sketch);
  });

  it('sets sync.isDirty = true after apply', () => {
    const store = createTestStore({
      sketch: { spreads: [{ id: 'sp1', textboxes: [{ id: 'tb1', en_US: content('hi') }] }] },
    });
    expect(store.getState().sync.isDirty).toBe(false);
    store.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('no-op safe when the step has no spreads (still sets dirty)', () => {
    const store = createTestStore({ sketch: { spreads: [] } });
    store.getState().applyTypographyToStepTextboxes('sketch', 'en_US', TYPO);
    expect(store.getState().sync.isDirty).toBe(true);
  });
});
