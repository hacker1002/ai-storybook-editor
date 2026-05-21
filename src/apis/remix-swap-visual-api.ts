// remix-swap-visual-api.ts — Client wrapper for POST /api/remix/swap-character-visual.
// Generic AI primitive: caller resolves the full SwapVisualCoreRequest (character
// image, human converted image, swap traits, character context) and persists the
// result (base_image_url) itself. Endpoint is stateless w.r.t. domain tables.
//
// Spec: ai-storybook-design/api/remix/03-swap-character-visual.md
//
// PII (API §Security): NEVER log human_image_url, human_description, or
// swap_traits[].description — these describe a real person (possibly a child).

import { createLogger } from '@/utils/logger';
import { callImageApi, type ImageApiFailure } from './image-api-client';
import type { TraitType } from '@/types/human';

const log = createLogger('Api', 'RemixSwapVisual');

export interface SwapVisualTrait {
  type: TraitType;
  description: string;
}

export interface SwapVisualCharacterContext {
  name: string;
  basic_info: object;
  personality: object;
  appearance: object;
  visual_description: string;
}

/** Self-contained request mirroring the backend Pydantic model. */
export interface SwapVisualCoreRequest {
  character_image_url: string;
  human_image_url: string;
  human_description: string;
  /** Only enabled traits that have a non-empty human description (caller-filtered). */
  swap_traits: SwapVisualTrait[];
  character_context: SwapVisualCharacterContext;
}

export interface SwapVisualCoreData {
  image_url: string;
  width: number;
  height: number;
  token_usage?: number;
}

/** Normalized result returned to UI orchestration. */
export interface SwapCharacterVisualResult {
  success: boolean;
  data?: SwapVisualCoreData;
  error?: string;
  errorCode?: string;
}

interface RawSwapResponse {
  success: boolean;
  data?: SwapVisualCoreData;
  error?: string;
}

const SWAP_VISUAL_PATH = '/api/remix/swap-character-visual';

export async function swapCharacterVisual(
  req: SwapVisualCoreRequest,
): Promise<SwapCharacterVisualResult> {
  // Only enum / counts / non-PII fields in logs (see file header).
  log.info('swapCharacterVisual', 'request', {
    characterName: req.character_context.name,
    swapTraitCount: req.swap_traits.length,
    swapTraitTypes: req.swap_traits.map((t) => t.type),
  });

  const res = await callImageApi<RawSwapResponse>(SWAP_VISUAL_PATH, req);

  if (!res.success) {
    const fail = res as ImageApiFailure;
    log.warn('swapCharacterVisual', 'failed', {
      error: fail.error,
      errorCode: fail.errorCode,
      httpStatus: fail.httpStatus,
    });
    return { success: false, error: fail.error, errorCode: fail.errorCode };
  }

  log.debug('swapCharacterVisual', 'ok', {
    width: res.data?.width,
    height: res.data?.height,
  });
  return { success: true, data: res.data };
}
