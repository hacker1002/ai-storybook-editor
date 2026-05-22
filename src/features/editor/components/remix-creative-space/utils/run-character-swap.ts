// run-character-swap.ts — Live character-swap orchestration (state machine).
// Extracted from the modal so it is unit-testable with injected deps (mock the
// API + builder, assert swapTasks transitions + onUpsert). See phase-07 tests.
//
// Flow: build request → guard fail ⇒ error; else loading → call API →
// success ⇒ onUpsert(base_image_url) + done; failure ⇒ error.

import { createLogger } from '@/utils/logger';
import type { Human } from '@/types/human';
import type { Character } from '@/types/character-types';
import type { RemixCharacterChoice, SwapPreviewState } from '@/types/remix';
import {
  swapCharacterVisual as defaultSwap,
  type SwapCharacterVisualResult,
} from '@/apis/remix-swap-visual-api';
import {
  buildSwapVisualCoreRequest as defaultBuildRequest,
  type SwapGuardReason,
} from './build-swap-visual-request';

const log = createLogger('Editor', 'RunCharacterSwap');

/** Generic, PII-safe messages for guard reasons (no human data echoed).
 *  Exported so the post-create variant orchestration (`run-variant-swap.ts`)
 *  reuses the exact same guard copy — DRY, single source of truth. */
export const GUARD_MESSAGES: Record<SwapGuardReason, string> = {
  NO_CHARACTER_IMAGE: 'Character base image not found.',
  NO_HUMAN: 'Pick a human first.',
  NO_VISUAL: 'Pick a visual first.',
  NO_CONVERTED_IMAGE: 'This visual has no normalized image yet.',
  EMPTY_SWAP_TRAITS: 'Enable at least one trait with a description.',
  NO_SNAPSHOT_CHARACTER: 'Character not found in snapshot.',
};

/** Map an API error to a generic message — never echoes human/PII data.
 *  Exported so `run-variant-swap.ts` keeps error-copy parity with the create
 *  flow (same 422 / rate-limit / timeout mapping). */
export function mapSwapError(errorCode?: string, fallback?: string): string {
  switch (errorCode) {
    case 'EMPTY_SWAP_TRAITS':
      return 'Enable at least one trait with a description.';
    case 'GEMINI_RATE_LIMIT':
      return 'Service busy — please retry in a moment.';
    case 'TIMEOUT':
    case 'CONNECTION_ERROR':
      return 'Swap timed out. Please retry.';
    default:
      return fallback || 'Swap failed. Please retry.';
  }
}

export interface RunCharacterSwapDeps {
  buildRequest: typeof defaultBuildRequest;
  swap: (
    req: Parameters<typeof defaultSwap>[0],
  ) => Promise<SwapCharacterVisualResult>;
}

const DEFAULT_DEPS: RunCharacterSwapDeps = {
  buildRequest: defaultBuildRequest,
  swap: defaultSwap,
};

export async function runCharacterSwap(
  charKey: string,
  entry: RemixCharacterChoice,
  beforeUrl: string | null,
  humans: Record<string, Human>,
  snapshotChars: Character[],
  setTask: (key: string, state: SwapPreviewState) => void,
  onUpsert: (key: string, patch: Partial<RemixCharacterChoice>) => void,
  deps: RunCharacterSwapDeps = DEFAULT_DEPS,
): Promise<void> {
  const built = deps.buildRequest(charKey, entry, beforeUrl, humans, snapshotChars);
  if (!built.ok) {
    log.debug('runCharacterSwap', 'guard failed', { charKey, reason: built.reason });
    setTask(charKey, {
      status: 'error',
      beforeUrl,
      afterUrl: null,
      errorMessage: GUARD_MESSAGES[built.reason],
    });
    return;
  }

  log.info('runCharacterSwap', 'swap start', { charKey });
  setTask(charKey, { status: 'loading', beforeUrl, afterUrl: null });

  const res = await deps.swap(built.request);

  if (res.success && res.data) {
    onUpsert(charKey, { base_image_url: res.data.image_url });
    setTask(charKey, { status: 'done', beforeUrl, afterUrl: res.data.image_url });
    return;
  }

  // PII: log charKey + code only, never human data.
  log.error('runCharacterSwap', 'swap failed', {
    charKey,
    errorCode: res.errorCode,
  });
  setTask(charKey, {
    status: 'error',
    beforeUrl,
    afterUrl: null,
    errorMessage: mapSwapError(res.errorCode, res.error),
  });
}
