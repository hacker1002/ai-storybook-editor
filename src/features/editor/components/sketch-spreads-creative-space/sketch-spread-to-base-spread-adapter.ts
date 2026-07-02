// sketch-spread-to-base-spread-adapter.ts — pure SketchSpread → BaseSpread projection so the
// sketch-spread canvas can reuse CanvasSpreadView/SpreadEditorPanel unchanged.
//
// Mapping (design README §4.2, adjusted to the real BaseSpread shape):
//  - pages   → PageData[] (single 'full' page or left+right), plain white background, no layout.
//  - image   → ONE full-bleed SpreadImage backdrop at geometry {0,0,100,100}; media_url ?? undefined
//              so EditableImage renders its own placeholder/spinner while null.
//  - textbox → passed through: SketchTextbox content ({text,geometry,typography}) is structurally
//              assignable to SpreadTextboxContent (only extra field on the target is optional `audio`).
// raw_images / shapes / videos / quizzes are intentionally omitted (sketch step has none).

import type { SketchSpread } from '@/types/sketch';
import { getSketchSpreadEffectiveUrl } from '@/types/sketch';
import type { BaseSpread, SpreadImage, SpreadTextbox, PageData } from '@/types/spread-types';

/** Stable id for the single backdrop image of a spread (derived, not stored). */
export function sketchBackdropImageId(spreadId: string): string {
  return `${spreadId}:img`;
}

function toPageData(number: number): PageData {
  return {
    number,
    type: 'normal_page',
    layout: null,
    background: { color: '#ffffff', texture: null },
  };
}

export function toBaseSpread(spread: SketchSpread): BaseSpread {
  const image: SpreadImage = {
    id: sketchBackdropImageId(spread.id),
    geometry: { x: 0, y: 0, w: 100, h: 100 },
    media_url: getSketchSpreadEffectiveUrl(spread) ?? undefined,
    editor_visible: true,
    player_visible: true,
  };

  return {
    id: spread.id,
    pages: spread.pages.map((_, index) => toPageData(index + 1)),
    images: [image],
    // Structurally compatible per types (SpreadTextboxContent only adds optional `audio`).
    textboxes: spread.textboxes as unknown as SpreadTextbox[],
  };
}
