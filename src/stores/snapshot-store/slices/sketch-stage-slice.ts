// sketch-stage-slice.ts — pure setters for the 2026-07-18 stage model (per-stage style
// workspace `base.styles[]` + flat 2-cell variant imagery). Split out of sketch-slice.ts
// (500-line rule): sketch-slice keeps char/prop + spread CRUD, this module owns every
// `sketch.stages[]` mutation. Generate orchestration lives in the stage generate-job slice —
// these are its write sinks.
//
// Invariants enforced here (single source — see snapshot/structure.md §sketch):
//  • styles[].is_selected  — ≤1 per stage; RADIO after the first lock (click on the locked
//    style is a no-op — unlock is not a thing, only switching).
//  • crops[].is_selected   — ≤1 per 2-cell crops[] (0 = not picked yet).
//  • variants[base]        — derived CLONE of the locked base chain (styles[sel] → crops[sel] →
//    effective illustration). Chain broken → clone CLEARED (stale clone is worse than none).
//    Same stage node (rtype 5) ⇒ the clone write needs no second lock.

import type { StateCreator } from 'zustand';
import type { Draft } from 'immer';
import type { SnapshotStore, SketchStageSlice } from '../types';
import type { SketchStage } from '@/types/sketch';
import { effectiveStageBaseUrl } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchStageSlice');

/**
 * Recompute the derived base-variant clone of ONE stage: full chain locked → variants[base]
 * .crops = [1 clone crop, is_selected, single synthesized 'created' illustration @ the effective
 * url]; chain broken → crops = [] (CLEAR). Creates a text-empty base variant only when there is
 * something to clone into it.
 */
function refreshBaseClone(stage: Draft<SketchStage>): void {
  const url = effectiveStageBaseUrl(stage as SketchStage);
  let base = stage.variants.find((v) => v.key === 'base');
  if (!base) {
    if (!url) return; // nothing to clone AND nothing to clear
    stage.variants.unshift({
      key: 'base',
      description: '',
      visual_design: '',
      art_language: '',
      illustrations: [],
      crops: [],
    });
    base = stage.variants[0]; // re-read as immer draft proxy
  }
  base.crops = url
    ? [
        {
          is_selected: true,
          illustrations: [
            { type: 'created', media_url: url, created_time: new Date().toISOString(), is_selected: true },
          ],
        },
      ]
    : [];
}

export const createSketchStageSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchStageSlice
> = (set) => ({
  setSketchStages: (stages) =>
    set((state) => {
      log.debug('setSketchStages', 'replace all', { count: stages.length });
      state.sketch.stages = stages;
      state.sync.isDirty = true;
    }),

  addSketchStageStyle: (stageKey, style) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      if (!stage) return;
      log.debug('addSketchStageStyle', 'append', { stageKey, count: stage.base.styles.length + 1 });
      stage.base.styles.push(style);
      state.sync.isDirty = true;
    }),

  // Job-slice rollback of a FAILED 'add' attempt (no raw landed) — the only remover; a user-facing
  // delete-style UI is deliberately deferred (design open #1). is_selected clears with the element
  // (a failed add is never locked, so the clone is untouched).
  removeSketchStageStyle: (stageKey, styleIndex) =>
    set((state) => {
      const styles = state.sketch.stages.find((s) => s.key === stageKey)?.base.styles;
      if (!styles || styleIndex < 0 || styleIndex >= styles.length) return;
      log.debug('removeSketchStageStyle', 'remove', { stageKey, styleIndex });
      styles.splice(styleIndex, 1);
      state.sync.isDirty = true;
    }),

  updateSketchStageStyleConfig: (stageKey, styleIndex, updates) =>
    set((state) => {
      const style = state.sketch.stages.find((s) => s.key === stageKey)?.base.styles[styleIndex];
      if (!style) return;
      log.debug('updateSketchStageStyleConfig', 'merge', { stageKey, styleIndex, keys: Object.keys(updates) });
      if (updates.style_prompt !== undefined) style.style_prompt = updates.style_prompt;
      if (updates.image_references !== undefined) style.image_references = updates.image_references;
      state.sync.isDirty = true;
    }),

  // 🔒 LOCK a style: exclusive is_selected within the stage + refresh the base clone.
  // RADIO after the first lock — clicking the already-locked style is a NO-OP (design 2026-07-18:
  // unlock is not offered, so the clone can never be un-gated by an unlock).
  setSketchStageStyleSelected: (stageKey, styleIndex) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      const style = stage?.base.styles[styleIndex];
      if (!stage || !style) return;
      if (style.is_selected) return; // radio-after-first — no-op
      log.debug('setSketchStageStyleSelected', 'lock style', { stageKey, styleIndex });
      stage.base.styles.forEach((s, j) => {
        s.is_selected = j === styleIndex;
      });
      refreshBaseClone(stage);
      state.sync.isDirty = true;
    }),

  // Pick 1 of the 2 base cells (per style). Locked-style pick change reflows the clone.
  selectSketchStageBaseCrop: (stageKey, styleIndex, cropIndex) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      const style = stage?.base.styles[styleIndex];
      if (!stage || !style?.crops[cropIndex]) return;
      log.debug('selectSketchStageBaseCrop', 'pick cell', { stageKey, styleIndex, cropIndex });
      style.crops.forEach((c, i) => {
        c.is_selected = i === cropIndex;
      });
      if (style.is_selected) refreshBaseClone(stage);
      state.sync.isDirty = true;
    }),

  // Pick 1 of the 2 variant cells (non-base — the base variant's single clone cell is derived).
  selectSketchStageVariantCrop: (stageKey, variantKey, cropIndex) =>
    set((state) => {
      const crops = state.sketch.stages
        .find((s) => s.key === stageKey)
        ?.variants.find((v) => v.key === variantKey)?.crops;
      if (!crops?.[cropIndex]) return;
      log.debug('selectSketchStageVariantCrop', 'pick cell', { stageKey, variantKey, cropIndex });
      crops.forEach((c, i) => {
        c.is_selected = i === cropIndex;
      });
      state.sync.isDirty = true;
    }),

  setSketchStageStyleIllustrations: (stageKey, styleIndex, illustrations) =>
    set((state) => {
      const style = state.sketch.stages.find((s) => s.key === stageKey)?.base.styles[styleIndex];
      if (!style) return;
      log.debug('setSketchStageStyleIllustrations', 'replace set', { stageKey, styleIndex, count: illustrations.length });
      style.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  // Replace the 2 positional cells (auto-cut / re-cut result — always lands 0 picked). A re-cut
  // on the LOCKED style breaks the base chain → the clone clears here (accepted consequence of
  // "raw changed ⇒ everything derives from the new raw").
  setSketchStageStyleCrops: (stageKey, styleIndex, crops) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      const style = stage?.base.styles[styleIndex];
      if (!stage || !style) return;
      log.debug('setSketchStageStyleCrops', 'replace crops', { stageKey, styleIndex, count: crops.length });
      style.crops = crops;
      if (style.is_selected) refreshBaseClone(stage);
      state.sync.isDirty = true;
    }),

  setSketchStageBaseCropIllustrations: (stageKey, styleIndex, cropIndex, illustrations) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      const style = stage?.base.styles[styleIndex];
      const crop = style?.crops[cropIndex];
      if (!stage || !style || !crop) return;
      log.debug('setSketchStageBaseCropIllustrations', 'replace crop set', { stageKey, styleIndex, cropIndex, count: illustrations.length });
      crop.illustrations = illustrations;
      // Editing the locked style's PICKED cell changes the effective base url → clone follows.
      if (style.is_selected && crop.is_selected) refreshBaseClone(stage);
      state.sync.isDirty = true;
    }),

  setSketchStageVariantIllustrations: (stageKey, variantKey, illustrations) =>
    set((state) => {
      const variant = state.sketch.stages
        .find((s) => s.key === stageKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchStageVariantIllustrations', 'replace set', { stageKey, variantKey, count: illustrations.length });
      variant.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  setSketchStageVariantCrops: (stageKey, variantKey, crops) =>
    set((state) => {
      const variant = state.sketch.stages
        .find((s) => s.key === stageKey)
        ?.variants.find((v) => v.key === variantKey);
      if (!variant) return;
      log.debug('setSketchStageVariantCrops', 'replace crops', { stageKey, variantKey, count: crops.length });
      variant.crops = crops;
      state.sync.isDirty = true;
    }),

  setSketchStageVariantCropIllustrations: (stageKey, variantKey, cropIndex, illustrations) =>
    set((state) => {
      const crop = state.sketch.stages
        .find((s) => s.key === stageKey)
        ?.variants.find((v) => v.key === variantKey)?.crops[cropIndex];
      if (!crop) return;
      log.debug('setSketchStageVariantCropIllustrations', 'replace crop set', { stageKey, variantKey, cropIndex, count: illustrations.length });
      crop.illustrations = illustrations;
      state.sync.isDirty = true;
    }),

  // Partial-merge of the 2 generate-driving fields ONLY — `description` is an Excel seed (not
  // editable in the space) and stages have NO height.
  // ⚡ UPSERT-ON-'base': an import may legally land a stage with no `base` variant (warn-only).
  // Without this, the Base ✏ save would silently no-op → the text is lost AND generate stays
  // gated forever (dead-end stage). Creating the text-holder here (mirror refreshBaseClone's
  // create-if-missing) un-gates API 11. Non-base variants stay find-only (they are import-seeded;
  // the space never creates them).
  updateSketchStageVariantText: (stageKey, variantKey, updates) =>
    set((state) => {
      const stage = state.sketch.stages.find((s) => s.key === stageKey);
      if (!stage) return;
      let variant = stage.variants.find((v) => v.key === variantKey);
      if (!variant) {
        if (variantKey !== 'base') return;
        log.debug('updateSketchStageVariantText', 'upsert missing base variant', { stageKey });
        stage.variants.unshift({
          key: 'base',
          description: '',
          visual_design: '',
          art_language: '',
          illustrations: [],
          crops: [],
        });
        variant = stage.variants[0]; // re-read as immer draft proxy
      }
      log.debug('updateSketchStageVariantText', 'merge', { stageKey, variantKey, keys: Object.keys(updates) });
      if (updates.visual_design !== undefined) variant.visual_design = updates.visual_design;
      if (updates.art_language !== undefined) variant.art_language = updates.art_language;
      state.sync.isDirty = true;
    }),
});
