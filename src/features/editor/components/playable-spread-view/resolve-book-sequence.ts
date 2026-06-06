// resolve-book-sequence.ts — Pure book-sequence walker for full-book video render.
//
// Mirrors EXACTLY the live player's auto-advance logic (`autoResolveNextSpread` +
// `resolveNextSpreadId` in `playable-spread-view.tsx` L54-85): resolve the linear
// playlist of spreads the renderer will stitch, following auto-mode + default-branch
// navigation. Pure / deterministic (no Date.now / Math.random) → unit-testable and
// safe to call from `calculateMetadata` in the render bundle (phase 02).
//
// Difference vs player: the walker is STATELESS forward-walk (no `currentSection`
// tracking) — it only checks "is `current` the `end_spread_id` of a section that
// has a `next_spread_id`?". This yields the same result as the stateful player
// UNDER THE INVARIANT that each spread_id appears as `end_spread_id` in at most ONE
// section. The data model enforces this implicitly: sections are contiguous,
// non-overlapping groups of spreads, so two sections cannot share an `end_spread_id`.
// If that invariant ever breaks (malformed data), `sections.find()` picks the first
// match — same as the player, which gates on `currentSection` but still takes the
// first matching section object. For normal well-formed books the behaviours are
// identical. See illustration-structure.md §sections for the schema contract.
// Render mode adds two guardrails the interactive player does NOT need:
//   - cycle guard (`visited` Set) — branch loops must terminate (video is finite)
//   - `MAX_BOOK_SPREADS` cap — defends against malformed data exploding the playlist
//
// Design: service/video-worker/06-book-render.md §2 (walker + parity notes).

import type { PlayableSpread } from '@/types/playable-types';
import type { Section } from '@/types/illustration-types';
import { MAX_BOOK_SPREADS } from '@/remotion/composition-metadata';

/** One resolved spread in the render playlist. */
export interface BookRenderSpread {
  spreadId: string;
  spread: PlayableSpread;
  /** Direction of the flip to the next spread; `null` = last spread (no flip). */
  turnToNext: 'next' | null;
}

/** Result of the walker. `truncated*` flags surface guardrail trips for job logs. */
export interface BookSequence {
  ordered: BookRenderSpread[];
  /** Hit a spread already visited → stopped early (branch-cycle guard). */
  truncatedByCycle: boolean;
  /** Reached `MAX_BOOK_SPREADS` → stopped early (data-explosion cap). */
  truncatedByCap: boolean;
}

export interface ResolveBookSequenceOptions {
  /** Optional starting spread. Falls back to `spreads[0].id` (player parity — see body). */
  startSpreadId?: string;
  /**
   * Edition does NOT affect the spread WALK — the playlist of spreads is identical
   * for classic/dynamic (same branch/auto-mode navigation). Edition-aware filtering
   * happens at the `animations[]` linearize layer instead: `getSpreadTotalSec` /
   * `buildBookSegmentLayout` (duration), `buildSpreadAudioSequences` (audio) and
   * `BookSpreadCore` (visual) all run `filterAnimationsForEdition`. Kept here so the
   * single sequence resolve still receives it for parity-of-call with the player.
   */
  edition: 'classic' | 'dynamic';
}

/**
 * Resolve the linear book render playlist.
 *
 * NEXT resolution priority (parity with player `autoResolveNextSpread` →
 * `resolveNextSpreadId`, and illustration-structure §Navigation priority):
 *   1. `spread.branch_setting` → default branch (`branches.find(is_default) ?? branches[0]`)
 *      → that section's `start_spread_id`
 *   2. `section.next_spread_id` where `section.end_spread_id === current`
 *   3. array order — `spreads[indexOf(current) + 1]`
 */
export function resolveBookSequence(
  spreads: PlayableSpread[],
  sections: Section[] | undefined,
  opts: ResolveBookSequenceOptions,
): BookSequence {
  void opts.edition; // reserved (see ResolveBookSequenceOptions.edition)

  const ordered: BookRenderSpread[] = [];
  const visited = new Set<string>();
  let truncatedByCycle = false;
  let truncatedByCap = false;

  // Entry point MUST match the live player, which starts auto-mode at `spreads[0]`
  // (`localSelectedSpreadId` inits to `spreads[0]?.id` — playable-spread-view.tsx
  // L221). Do NOT default to `sections[0].start_spread_id`: when spreads[0] is a
  // branch-picker (has `branch_setting`) it precedes the first section, so starting
  // at the section start would silently drop the branch-choice spread and follow no
  // branch. Parity (preview === output) requires the same entry as the player.
  let current: string | undefined = opts.startSpreadId ?? spreads[0]?.id;

  while (current != null) {
    const spread = spreads.find((s) => s.id === current);
    if (!spread) break; // dangling id — stop

    if (visited.has(current)) {
      truncatedByCycle = true;
      break;
    }
    if (ordered.length >= MAX_BOOK_SPREADS) {
      truncatedByCap = true;
      break;
    }
    visited.add(current);

    // ── resolve NEXT (priority: branch_setting > section.next_spread_id > array order) ──
    let next: string | null;
    if (spread.branch_setting) {
      const branches = spread.branch_setting.branches;
      const defaultBranch = branches.find((b) => b.is_default) ?? branches[0];
      const targetSection = sections?.find((s) => s.id === defaultBranch?.section_id);
      next = targetSection?.start_spread_id ?? null;
    } else {
      const endSection = sections?.find(
        (s) => s.end_spread_id === current && s.next_spread_id != null,
      );
      const linearNext = spreads[spreads.findIndex((s) => s.id === current) + 1]?.id;
      next = endSection?.next_spread_id ?? linearNext ?? null;
    }

    ordered.push({ spreadId: current, spread, turnToNext: next ? 'next' : null });

    if (!next) break;
    current = next;
  }

  return { ordered, truncatedByCycle, truncatedByCap };
}
