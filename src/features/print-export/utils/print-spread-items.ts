// print-spread-items.ts — Pure item-filter predicates for the static print render.
//
// Extracted from PrintSpreadCanvas so the "which items get printed" rules are
// unit-testable without mounting GSAP/Rive-heavy Editable* components. Mirrors
// the player-canvas static filters exactly: hidden (player_visible===false),
// outside staging, off-edition composite variants, and empty (no URL / no text).
import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadTextboxContent } from "@/types/spread-types";
import { isInStaging } from "@/features/editor/components/playable-spread-view/player-utils";
import {
  isVariantInAnyComposite,
  type CompositeContext,
} from "@/features/editor/utils/composite-resolve-helpers";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";

type SpreadImage = NonNullable<PlayableSpread["images"]>[number];
type SpreadShape = NonNullable<PlayableSpread["shapes"]>[number];
type SpreadTextbox = NonNullable<PlayableSpread["textboxes"]>[number];

/** True when an image should be rendered for print. */
export function shouldRenderPrintImage(
  image: SpreadImage,
  composites: PlayableSpread["composites"],
  compositeCtxMap: Map<string, CompositeContext>
): boolean {
  if (image.player_visible === false) return false;
  if (!isInStaging(image.geometry)) return false;
  // Off-edition composite variant → not part of the 'classic' frame.
  const compositeCtx = compositeCtxMap.get(image.id);
  if (!compositeCtx && isVariantInAnyComposite({ composites }, image.id)) {
    return false;
  }
  const hasUrl =
    image.final_hires_media_url ||
    image.illustrations?.some((i) => i.media_url) ||
    image.media_url;
  return Boolean(hasUrl);
}

/** True when a shape should be rendered for print. */
export function shouldRenderPrintShape(shape: SpreadShape): boolean {
  if (shape.player_visible === false) return false;
  if (!isInStaging(shape.geometry)) return false;
  return true;
}

/** Resolve printable textboxes for the given language: visible, non-empty,
 *  in-staging — with the language-resolved content. */
export function resolvePrintTextboxes(
  textboxes: SpreadTextbox[] | undefined,
  languageKey: string
): Array<{ textbox: SpreadTextbox; data: SpreadTextboxContent }> {
  if (!textboxes) return [];
  const out: Array<{ textbox: SpreadTextbox; data: SpreadTextboxContent }> = [];
  for (const textbox of textboxes) {
    if (textbox.player_visible === false) continue;
    const result = getTextboxContentForLanguage(textbox, languageKey);
    if (!result?.content?.geometry) continue;
    if (!result.content.text) continue;
    if (!isInStaging(result.content.geometry)) continue;
    out.push({ textbox, data: result.content });
  }
  return out;
}
