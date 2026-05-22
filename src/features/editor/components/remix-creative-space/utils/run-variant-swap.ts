// run-variant-swap.ts — Post-create per-variant re-swap orchestration (state
// machine). Sibling of `run-character-swap.ts`: same shape + same shared
// helpers (request builder, GUARD_MESSAGES, mapSwapError, swapCharacterVisual),
// but the config source is the FROZEN `remix_config` (RemixConfigCharacterView)
// and the persist target is `variants[].visual_swap_url` (NOT a draft).
//
// Extracted from the modal so it is unit-testable with injected deps (mock the
// swap API, assert setTask transitions + persist). See VariantsVisualModal v2.
//
// Flow: build request (reuse buildSwapVisualCoreRequest) → guard fail ⇒ error;
// else loading → call API → success ⇒ await persist(image_url): persisted ⇒
// done; persist returned false (Supabase write failed + rolled back) ⇒ error
// (so the optimistic AFTER image is never shown as committed); API failure ⇒ error.

import { createLogger } from '@/utils/logger';
import type { Human } from '@/types/human';
import type { Character } from '@/types/character-types';
import type { RemixCharacterChoice } from '@/types/remix';
import type { SwapPreviewState } from '@/types/remix';
import type { RemixConfigCharacterView } from '@/stores/remix-store/selectors';
import {
  swapCharacterVisual as defaultSwap,
  type SwapCharacterVisualResult,
} from '@/apis/remix-swap-visual-api';
import { buildSwapVisualCoreRequest as defaultBuildRequest } from './build-swap-visual-request';
import { GUARD_MESSAGES, mapSwapError } from './run-character-swap';

const log = createLogger('Editor', 'RunVariantSwap');

export interface RunVariantSwapDeps {
  buildRequest: typeof defaultBuildRequest;
  swap: (
    req: Parameters<typeof defaultSwap>[0],
  ) => Promise<SwapCharacterVisualResult>;
}

const DEFAULT_DEPS: RunVariantSwapDeps = {
  buildRequest: defaultBuildRequest,
  swap: defaultSwap,
};

/**
 * Orchestrate a single variant re-swap.
 *
 * @param variantKey  Per-variant task identity (keys `swapTasks` + persist target).
 * @param cfgChar     Frozen `remix_config` character view ({ human_id, visual,
 *                    traits[], converted_image }). `null` ⇒ prop/missing → guard error.
 * @param beforeUrl   Variant illustration `is_selected` (fallback `[0]`) — source sheet
 *                    (Image #1: template/pose).
 * @param humanImageUrlOverride  Appearance reference (Image #2). For NON-base
 *                    variants this is the base variant's swapped `visual_swap_url`
 *                    (consistency source-of-truth); `null` ⇒ base flow → builder
 *                    falls back to the human-normalize image. Caller gates that a
 *                    non-base variant only runs once the base swap exists.
 * @param humans      Live humans cache keyed by id (mirrors create flow).
 * @param snapChar    Snapshot characters[] — supplies `character_context`.
 * @param charKey     Character key (snapshot lookup + request mapping).
 * @param setTask     Modal-level per-variant task setter (loading → done|error).
 * @param persist     Persist writer; wraps `setVariantVisualSwapUrl(...)`.
 *                    Resolves `true` when the DB write committed, `false` when
 *                    it failed and was rolled back → mapped to an error task.
 *                    Side effects (setTask/persist) are the only outputs.
 */
export async function runVariantSwap(
  variantKey: string,
  cfgChar: RemixConfigCharacterView | null,
  beforeUrl: string | null,
  humanImageUrlOverride: string | null,
  humans: Record<string, Human>,
  snapChar: Character[],
  charKey: string,
  setTask: (key: string, state: SwapPreviewState) => void,
  persist: (imageUrl: string) => Promise<boolean>,
  deps: RunVariantSwapDeps = DEFAULT_DEPS,
): Promise<void> {
  if (!cfgChar) {
    log.debug('runVariantSwap', 'no config char (prop/missing)', { variantKey, charKey });
    setTask(variantKey, {
      status: 'error',
      beforeUrl,
      afterUrl: null,
      errorMessage: GUARD_MESSAGES.NO_HUMAN,
    });
    return;
  }

  // Adapt the frozen-config view to the RemixCharacterChoice shape the shared
  // builder expects — converted_image is re-resolved from `humans` inside the
  // builder (same path the create flow uses), so request mapping stays DRY.
  const entry: RemixCharacterChoice = {
    key: charKey,
    human_id: cfgChar.human_id,
    visual: cfgChar.visual,
    traits: cfgChar.traits,
    base_image_url: null,
    is_enabled: true,
  };

  const built = deps.buildRequest(
    charKey,
    entry,
    beforeUrl,
    humans,
    snapChar,
    humanImageUrlOverride,
  );
  if (!built.ok) {
    log.debug('runVariantSwap', 'guard failed', { variantKey, charKey, reason: built.reason });
    setTask(variantKey, {
      status: 'error',
      beforeUrl,
      afterUrl: null,
      errorMessage: GUARD_MESSAGES[built.reason],
    });
    return;
  }

  log.info('runVariantSwap', 'swap start', { variantKey, charKey });
  setTask(variantKey, { status: 'loading', beforeUrl, afterUrl: null });

  const res = await deps.swap(built.request);

  if (res.success && res.data) {
    // Only mark `done` once the persist write actually committed. A `false`
    // result means the Supabase write failed and the optimistic store value was
    // rolled back — surface it as an error so the AFTER image is not shown as
    // saved (it would silently vanish on reopen otherwise).
    const persisted = await persist(res.data.image_url);
    if (persisted) {
      setTask(variantKey, { status: 'done', beforeUrl, afterUrl: res.data.image_url });
      return;
    }
    log.error('runVariantSwap', 'persist failed — surface as error', {
      variantKey,
      charKey,
    });
    setTask(variantKey, {
      status: 'error',
      beforeUrl,
      afterUrl: null,
      errorMessage: 'Saving the swap failed. Please retry.',
    });
    return;
  }

  // PII: log keys + code only, never human data.
  log.error('runVariantSwap', 'swap failed', {
    variantKey,
    charKey,
    errorCode: res.errorCode,
  });
  setTask(variantKey, {
    status: 'error',
    beforeUrl,
    afterUrl: null,
    errorMessage: mapSwapError(res.errorCode, res.error),
  });
}
