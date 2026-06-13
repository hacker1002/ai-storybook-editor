// build-model-params.ts — Pure mapping: right-sidebar SwapModelParams → the job
// body `model_params` (⚡2026-06-13). Per stage group:
//   sprites | mixes (group 'swap')  → { model: swapModel, params: { temperature } }
//   rmbgs                           → { model: rmbgModel }
//   upscales                        → { model: upscaleModel, params: { noise } }
// FE always sends the value; the API allowlists/clamps/maps per model and drops
// keys a model doesn't support (e.g. real-esrgan ignores noise). Lives in store
// slices (mirrors the co-located *.test.ts layout) and avoids a jobs-api↔store
// import cycle. Spec: design 05-swap-crop-sheet-modal.md §4.6.

import type { SwapModelParams, StageKind } from '@/types/remix';
import type { ModelParamsBody } from '@/apis/jobs-api';

/** Stage discriminator for `buildModelParams` — the 3 stage columns plus the
 *  sprite plane. `'sprites'` is NOT a `StageKind` (sprites live on their own
 *  JSONB column) but resolves the SAME 'swap' group as `'mixes'`. */
export type ModelParamsStage = StageKind | 'sprites';

/** Map the sidebar params to the job body `model_params` for a stage. Sprites +
 *  Crops (`'sprites'`/`'mixes'`) share the 'swap' group (one Temperature
 *  stepper). Pure — no I/O, no logging. */
export function buildModelParams(
  stage: ModelParamsStage,
  p: SwapModelParams,
): ModelParamsBody {
  switch (stage) {
    case 'sprites':
    case 'mixes':
      return { model: p.swapModel, params: { temperature: p.swapTemperature } };
    case 'rmbgs':
      return { model: p.rmbgModel };
    case 'upscales':
      return { model: p.upscaleModel, params: { noise: p.noise } };
  }
}
