import { describe, it, expect } from 'vitest';
import { buildModelParams } from './build-model-params';
import type { SwapModelParams } from '@/types/remix';

// Non-default values per field so each branch is provably reading the RIGHT one.
const PARAMS: SwapModelParams = {
  swapModel: 'google/nano-banana-pro',
  swapTemperature: 0.7,
  rmbgModel: 'bria/remove-background',
  upscaleModel: 'alexgenovese/upscaler',
  noise: 2.5,
  // ⚡2026-06-29 grain knobs — NOT part of model_params (top-level body field),
  // so buildModelParams ignores them; present only to satisfy the type.
  grainEnabled: true,
  grainAmp: 9,
  grainBlur: 0.8,
};

describe('buildModelParams', () => {
  it("'sprites' → swap group (model + temperature)", () => {
    expect(buildModelParams('sprites', PARAMS)).toEqual({
      model: 'google/nano-banana-pro',
      params: { temperature: 0.7 },
    });
  });

  it("'mixes' resolves the SAME swap group as 'sprites' (shared stepper)", () => {
    expect(buildModelParams('mixes', PARAMS)).toEqual(
      buildModelParams('sprites', PARAMS),
    );
  });

  it("'rmbgs' → rmbg model only (no params)", () => {
    expect(buildModelParams('rmbgs', PARAMS)).toEqual({
      model: 'bria/remove-background',
    });
  });

  it("'upscales' → upscale model + noise", () => {
    expect(buildModelParams('upscales', PARAMS)).toEqual({
      model: 'alexgenovese/upscaler',
      params: { noise: 2.5 },
    });
  });
});
