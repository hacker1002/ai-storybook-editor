// remotion/build-spread-audio-sequences.ts — pure builder for a spread's
// declarative <Audio> sequences (render-mode replacement for the live player's
// PLAY/READ_ALONG audio side-effects).
//
// Shared by the single-spread composition AND the full-book composition so audio
// timing is identical in both. The book composition adds a `segmentStartFrame`
// offset (the spread-segment's position on the book frame axis) on top of each
// per-step local frame — that is the ONLY difference between the two callers, so
// the per-step math lives here once (DRY) and offsets compose by simple addition.
//
// Design: 06-book-render.md §9.1 (per-spread audio 0:a, committed v1) +
// 03-timeline-linearization.md §9.

import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import type { SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";
import { filterAnimationsForEdition } from "@/features/editor/components/playable-spread-view/player-utils";

export interface SpreadAudioSequence {
  /** Stable React key — unique within the spread (target id + local start). */
  key: string;
  /** Absolute composition frame the <Audio> starts at (already includes offset). */
  from: number;
  url: string;
}

/**
 * Build the ordered list of audio sequences for one spread.
 *
 * @param spread spread to source PLAY/READ_ALONG audio from.
 * @param language narration language (textbox content key).
 * @param fps composition fps.
 * @param segmentStartFrame absolute frame the spread-segment begins at on the
 *   book frame axis. 0 for the single-spread composition. The book composition
 *   passes the spread-segment's offset so per-spread audio never overlaps the
 *   previous spread's settle hold or the silent transition that follows.
 * @param edition play edition — gates which media audio is emitted, MUST match
 *   the rendered timeline. Classic emits ONLY read-along narration (no PLAY
 *   sound-effects); dynamic drops on_click-chained audio. Defaults to
 *   `interactive` (all media) for the edition-agnostic single-spread composition.
 */
export function buildSpreadAudioSequences(
  spread: PlayableSpread,
  language: RemixLanguageCode,
  fps: number,
  segmentStartFrame = 0,
  edition: PlayEdition = "interactive"
): SpreadAudioSequence[] {
  const animations = filterAnimationsForEdition(spread.animations ?? [], edition);
  const { steps } = linearizeSpreadTimeline(animations);
  const textboxes = (spread.textboxes ?? []) as SpreadTextbox[];
  const tbContent = (id: string): SpreadTextboxContent | undefined => {
    const c = textboxes.find((t) => t.id === id)?.[language];
    return c && typeof c === "object" && "text" in c ? (c as SpreadTextboxContent) : undefined;
  };
  const audioById = new Map((spread.audios ?? []).map((a) => [a.id, a]));

  return steps
    .filter((s) => s.isMedia)
    .map((s) => {
      let url: string | null | undefined;
      if (s.anim.target.type === "audio") {
        url = audioById.get(s.anim.target.id)?.media_url;
      } else if (
        s.anim.effect.type === EFFECT_TYPE.READ_ALONG &&
        s.anim.target.type === "textbox"
      ) {
        url = tbContent(s.anim.target.id)?.audio?.combined_audio_url;
      }
      if (!url) return null;
      const localFrom = Math.max(0, Math.round(s.startSec * fps));
      return {
        // key includes segmentStartFrame so the SAME spread reused at two book
        // positions (branch revisit is guarded, but defensive) stays unique.
        key: `${segmentStartFrame}-${s.anim.target.id}-${s.startSec}`,
        from: segmentStartFrame + localFrom,
        url,
      };
    })
    .filter((x): x is SpreadAudioSequence => x !== null);
}
