// sketch-stage-slice.test.ts — setters + invariants of the 2026-07-18 stage model: ≤1 is_selected
// (style radio-after-first, crop 1/2), the derived variants[base] clone (clear-on-broken-chain),
// partial-merge text, replace-all import.

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchStageSlice } from './sketch-stage-slice';
import { effectiveStageBaseUrl, effectiveStageVariantUrl } from '@/types/sketch';
import type { SketchStage, SketchStageCrop, SketchStageStyle, SketchStageVariant } from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';

// Isolated harness: the stage slice + the only cross-slice fields its actions touch
// (sketch.stages + sync.isDirty). Avoids pulling the full store into a unit test.
/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore(stages: SketchStage[] = []) {
  return create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchStageSlice as any)(...a),
      sketch: { stages },
      sync: { isDirty: false },
    })),
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ill = (url: string, selected = true): Illustration => ({
  type: 'created',
  media_url: url,
  created_time: '2026-07-18T00:00:00Z',
  is_selected: selected,
});

const crop = (url: string | null, selected = false): SketchStageCrop => ({
  is_selected: selected,
  illustrations: url ? [ill(url)] : [],
});

const style = (over: Partial<SketchStageStyle> = {}): SketchStageStyle => ({
  style_prompt: 'p',
  is_selected: false,
  image_references: [],
  illustrations: [],
  crops: [],
  ...over,
});

const variant = (key: string, over: Partial<SketchStageVariant> = {}): SketchStageVariant => ({
  key,
  description: 'seed',
  visual_design: 'vd',
  art_language: 'al',
  illustrations: [],
  crops: [],
  ...over,
});

const stage = (over: Partial<SketchStage> = {}): SketchStage => ({
  key: 'forest',
  base: { styles: [] },
  variants: [variant('base'), variant('storm')],
  ...over,
});

const stageOf = (store: ReturnType<typeof createTestStore>): SketchStage =>
  store.getState().sketch.stages[0];
const baseVariantOf = (store: ReturnType<typeof createTestStore>): SketchStageVariant | undefined =>
  stageOf(store).variants.find((v) => v.key === 'base');

describe('setSketchStageStyleSelected — radio-after-first + clone', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore([
      stage({
        base: {
          styles: [
            style({ crops: [crop('a0.png', true), crop('a1.png')] }),
            style({ crops: [crop('b0.png', true), crop('b1.png')] }),
          ],
        },
      }),
    ]);
  });

  it('locks exclusively within the stage (≤1 is_selected)', () => {
    store.getState().setSketchStageStyleSelected('forest', 0);
    expect(stageOf(store).base.styles.map((s) => s.is_selected)).toEqual([true, false]);
    store.getState().setSketchStageStyleSelected('forest', 1);
    expect(stageOf(store).base.styles.map((s) => s.is_selected)).toEqual([false, true]);
  });

  it('clicking the ALREADY-locked style is a NO-OP (radio after the first lock)', () => {
    store.getState().setSketchStageStyleSelected('forest', 0);
    store.setState((s: { sync: { isDirty: boolean } }) => {
      s.sync.isDirty = false;
    });
    store.getState().setSketchStageStyleSelected('forest', 0);
    expect(stageOf(store).base.styles[0].is_selected).toBe(true); // still locked — never un-locks
    expect(store.getState().sync.isDirty).toBe(false); // true no-op
  });

  it('lock with a full chain → variants[base].crops = [1 clone, is_selected, effective url]', () => {
    store.getState().setSketchStageStyleSelected('forest', 1);
    const base = baseVariantOf(store)!;
    expect(base.crops).toHaveLength(1);
    expect(base.crops[0].is_selected).toBe(true);
    expect(base.crops[0].illustrations[0].media_url).toBe('b0.png');
    expect(effectiveStageVariantUrl(base)).toBe('b0.png');
  });

  it('lock with a BROKEN chain (no crop picked) → clone CLEARED', () => {
    // Seed a stale clone first (locked style 0), then re-lock onto a style with no picked crop.
    store.getState().setSketchStageStyleSelected('forest', 0);
    store.setState((s: { sketch: { stages: SketchStage[] } }) => {
      s.sketch.stages[0].base.styles[1].crops.forEach((c) => {
        c.is_selected = false;
      });
    });
    store.getState().setSketchStageStyleSelected('forest', 1);
    expect(baseVariantOf(store)!.crops).toEqual([]); // stale clone is worse than none
    expect(effectiveStageBaseUrl(stageOf(store))).toBeNull();
  });

  it('creates a text-empty base variant when none exists AND there is something to clone', () => {
    store = createTestStore([
      stage({
        base: { styles: [style({ crops: [crop('a0.png', true), crop('a1.png')] })] },
        variants: [variant('storm')], // no base variant
      }),
    ]);
    store.getState().setSketchStageStyleSelected('forest', 0);
    const base = baseVariantOf(store);
    expect(base).toBeDefined();
    expect(base!.crops[0].illustrations[0].media_url).toBe('a0.png');
    expect(base!.visual_design).toBe(''); // synthesized holder — text stays empty
  });
});

describe('selectSketchStageBaseCrop / selectSketchStageVariantCrop — pick 1/2', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore([
      stage({
        base: { styles: [style({ crops: [crop('a0.png'), crop('a1.png')] })] },
        variants: [variant('base'), variant('storm', { crops: [crop('v0.png'), crop('v1.png')] })],
      }),
    ]);
  });

  it('base pick is exclusive within the 2 cells', () => {
    store.getState().selectSketchStageBaseCrop('forest', 0, 1);
    expect(stageOf(store).base.styles[0].crops.map((c) => c.is_selected)).toEqual([false, true]);
    store.getState().selectSketchStageBaseCrop('forest', 0, 0);
    expect(stageOf(store).base.styles[0].crops.map((c) => c.is_selected)).toEqual([true, false]);
  });

  it('base pick on the LOCKED style refreshes the clone to the new cell', () => {
    store.getState().selectSketchStageBaseCrop('forest', 0, 0);
    store.getState().setSketchStageStyleSelected('forest', 0); // lock → clone = a0
    expect(baseVariantOf(store)!.crops[0].illustrations[0].media_url).toBe('a0.png');
    store.getState().selectSketchStageBaseCrop('forest', 0, 1); // re-pick on the locked style
    expect(baseVariantOf(store)!.crops[0].illustrations[0].media_url).toBe('a1.png');
  });

  it('base pick on an UNLOCKED style does NOT touch the clone', () => {
    store.getState().selectSketchStageBaseCrop('forest', 0, 0);
    expect(baseVariantOf(store)!.crops).toEqual([]); // style never locked → no clone
  });

  it('variant pick is exclusive within the 2 cells', () => {
    store.getState().selectSketchStageVariantCrop('forest', 'storm', 1);
    const storm = stageOf(store).variants.find((v) => v.key === 'storm')!;
    expect(storm.crops.map((c) => c.is_selected)).toEqual([false, true]);
    expect(effectiveStageVariantUrl(storm)).toBe('v1.png');
  });

  it('out-of-range index is a no-op', () => {
    store.getState().selectSketchStageBaseCrop('forest', 0, 5);
    expect(stageOf(store).base.styles[0].crops.every((c) => !c.is_selected)).toBe(true);
  });
});

describe('setSketchStageStyleCrops — re-cut lands 0 picked + clone re-derives', () => {
  it('overwriting the LOCKED style crops (0 picked) CLEARS the clone (broken chain)', () => {
    const store = createTestStore([
      stage({ base: { styles: [style({ crops: [crop('a0.png', true), crop('a1.png')] })] } }),
    ]);
    store.getState().setSketchStageStyleSelected('forest', 0); // clone = a0
    expect(baseVariantOf(store)!.crops).toHaveLength(1);
    store.getState().setSketchStageStyleCrops('forest', 0, [crop('n0.png'), crop('n1.png')]); // 0 picked
    expect(stageOf(store).base.styles[0].crops.map((c) => c.is_selected)).toEqual([false, false]);
    expect(baseVariantOf(store)!.crops).toEqual([]); // chain broke → clone cleared
  });
});

describe('setSketchStageBaseCropIllustrations — clone follows the picked cell edit', () => {
  it('editing the locked style PICKED cell re-derives the clone url', () => {
    const store = createTestStore([
      stage({ base: { styles: [style({ crops: [crop('a0.png', true), crop('a1.png')] })] } }),
    ]);
    store.getState().setSketchStageStyleSelected('forest', 0);
    store.getState().setSketchStageBaseCropIllustrations('forest', 0, 0, [ill('edited.png')]);
    expect(baseVariantOf(store)!.crops[0].illustrations[0].media_url).toBe('edited.png');
  });
});

describe('updateSketchStageVariantText — partial merge, no height, description kept', () => {
  it('merges only the provided fields and never touches description', () => {
    const store = createTestStore([stage()]);
    store.getState().updateSketchStageVariantText('forest', 'storm', { visual_design: 'new vd' });
    const storm = stageOf(store).variants.find((v) => v.key === 'storm')!;
    expect(storm.visual_design).toBe('new vd');
    expect(storm.art_language).toBe('al'); // untouched
    expect(storm.description).toBe('seed'); // Excel seed preserved
    expect('height' in storm).toBe(false); // stage variant never grows a height
  });

  it('unknown stage / unknown NON-BASE variant is a no-op', () => {
    const store = createTestStore([stage()]);
    store.getState().updateSketchStageVariantText('nope', 'storm', { visual_design: 'x' });
    store.getState().updateSketchStageVariantText('forest', 'nope', { visual_design: 'x' });
    expect(stageOf(store).variants.find((v) => v.key === 'storm')!.visual_design).toBe('vd');
    expect(stageOf(store).variants.some((v) => v.key === 'nope')).toBe(false); // never upserts non-base
  });

  it("UPSERTS a missing 'base' variant so the Base ✏ save is never silently lost", () => {
    // Import may legally land a stage with no base variant (warn-only) — the text edit must
    // create the holder, un-gating API 11 (reviewer finding: dead-end stage otherwise).
    const store = createTestStore([stage({ variants: [variant('storm')] })]);
    store.getState().updateSketchStageVariantText('forest', 'base', {
      visual_design: 'night alley',
      art_language: 'charcoal',
    });
    const base = baseVariantOf(store);
    expect(base).toBeDefined();
    expect(base!.visual_design).toBe('night alley');
    expect(base!.art_language).toBe('charcoal');
    expect(base!.description).toBe(''); // synthesized holder — seed text stays empty
    expect(base!.crops).toEqual([]);
    expect(store.getState().sync.isDirty).toBe(true);
  });
});

describe('setSketchStages / addSketchStageStyle / removeSketchStageStyle', () => {
  it('setSketchStages replaces the whole array (import replace-all)', () => {
    const store = createTestStore([stage()]);
    const next = [stage({ key: 'cave', variants: [variant('base')] })];
    store.getState().setSketchStages(next);
    expect(store.getState().sketch.stages).toHaveLength(1);
    expect(store.getState().sketch.stages[0].key).toBe('cave');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('addSketchStageStyle appends; removeSketchStageStyle removes exactly that attempt', () => {
    const store = createTestStore([stage()]);
    store.getState().addSketchStageStyle('forest', style({ style_prompt: 'first' }));
    store.getState().addSketchStageStyle('forest', style({ style_prompt: 'second' }));
    expect(stageOf(store).base.styles.map((s) => s.style_prompt)).toEqual(['first', 'second']);
    store.getState().removeSketchStageStyle('forest', 0);
    expect(stageOf(store).base.styles.map((s) => s.style_prompt)).toEqual(['second']);
  });

  it('setSketchStageVariantCrops replaces the variant cells verbatim', () => {
    const store = createTestStore([stage()]);
    store.getState().setSketchStageVariantCrops('forest', 'storm', [crop('n0.png'), crop('n1.png')]);
    const storm = stageOf(store).variants.find((v) => v.key === 'storm')!;
    expect(storm.crops.map((c) => c.illustrations[0]?.media_url)).toEqual(['n0.png', 'n1.png']);
  });
});
