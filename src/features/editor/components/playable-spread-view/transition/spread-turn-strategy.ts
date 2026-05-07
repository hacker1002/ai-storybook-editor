// spread-turn-strategy.ts - Variant dispatch helper for `book.effects.transition_type`.
// Phase 1 ships only the `turn` variant. All other declared variants currently bypass
// to the legacy instant-swap path; unknown / null values fall back to `turn` so that
// new books default to the new behavior (spec §1.2).

import type { TransitionType } from '@/types/editor';

/** Strategy that the caller should execute for a given transition variant. */
export type TransitionStrategy = 'turn' | 'bypass';

/** Static map keyed by every declared `TransitionType`. Add new variants here once
 *  they are implemented. Forward-compat: unknown DB strings hit the resolver fallback. */
export const TRANSITION_STRATEGY_MAP: Record<TransitionType, TransitionStrategy> = {
  turn: 'turn',
  parallax: 'bypass',
  slide: 'bypass',
  fade: 'bypass',
  flip: 'bypass',
  zoom: 'bypass',
};

/**
 * Resolve a `transition_type` value into a concrete strategy.
 * - `null` / `undefined` → `'turn'` (default per spec §1.2)
 * - unknown string       → `'turn'` (forward-compat fallback)
 * - known value          → `TRANSITION_STRATEGY_MAP[value]`
 */
export function resolveTransitionStrategy(
  value: TransitionType | string | null | undefined,
): TransitionStrategy {
  if (value === null || value === undefined) return 'turn';
  const mapped = TRANSITION_STRATEGY_MAP[value as TransitionType];
  return mapped ?? 'turn';
}
