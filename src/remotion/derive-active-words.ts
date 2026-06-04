// remotion/derive-active-words.ts
// Frame-driven read-along word highlight (render-mode replacement for the live
// player's audio.currentTime polling). word_timings are relative to the
// narration audio start = the READ_ALONG step's linearized startSec (which now
// carries the same TRIGGER_DELAY pacing as buildMasterTimeline → audio + words
// stay locked to the tween). Active word = latest word whose startMs has elapsed,
// cleared after the last word ends.

import type { PlayableSpread } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import type { SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";

export function deriveActiveWords(
  frame: number,
  spread: PlayableSpread,
  fps: number,
  language: RemixLanguageCode
): Record<string, number> {
  const { steps } = linearizeSpreadTimeline(spread.animations);
  const textboxes = (spread.textboxes ?? []) as SpreadTextbox[];
  const tbContent = (id: string): SpreadTextboxContent | undefined => {
    const c = textboxes.find((t) => t.id === id)?.[language];
    return c && typeof c === "object" && "text" in c
      ? (c as SpreadTextboxContent)
      : undefined;
  };

  const result: Record<string, number> = {};
  for (const s of steps) {
    if (
      s.anim.effect.type !== EFFECT_TYPE.READ_ALONG ||
      s.anim.target.type !== "textbox"
    )
      continue;
    const wts = tbContent(s.anim.target.id)?.audio?.word_timings;
    if (!wts?.length) continue;
    const relMs = (frame / fps - s.startSec) * 1000;
    let idx = -1;
    if (relMs >= 0 && relMs <= wts[wts.length - 1].endMs) {
      for (let i = 0; i < wts.length; i++) {
        if (relMs >= wts[i].startMs) idx = i;
        else break;
      }
    }
    result[s.anim.target.id] = idx;
  }
  return result;
}
