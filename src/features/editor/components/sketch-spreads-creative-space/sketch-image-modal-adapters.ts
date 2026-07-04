// sketch-image-modal-adapters.ts — pure adapters bridging the sketch snapshot shape to the
// SHARED Edit/Extract image modals (which speak the illustration/SpreadImage shapes). Kept
// standalone (out of the canvas component) so they stay side-effect-free and unit-testable.
//
// caller-owns-write: the modals never touch the sketch store. Edit emits the full illustration
// list (onUpdateIllustrations); Extract emits ExtractResult[] (onCreateImages). The canvas reads
// the resolved url out of those and appends a NEW page-image version via
// addSketchSpreadImageVersion — these adapters only do the shape/url math.

import type { Illustration } from '@/types/prop-types';
import type { Geometry, SpreadImage } from '@/types/spread-types';
import type { SketchSpreadIllustration, SketchSpreadImage } from '@/types/sketch';

/**
 * Seed the Edit modal: SketchSpreadIllustration[] → Illustration[]. Field-for-field (both carry
 * media_url/created_time/is_selected). `type` is intentionally omitted — the modal coerces an
 * absent type to 'created', which is the right default for a page-image variant with no edit
 * lineage of its own.
 */
export function toIllustrations(sketchIllus: SketchSpreadIllustration[]): Illustration[] {
  return sketchIllus.map((i) => ({
    media_url: i.media_url,
    created_time: i.created_time,
    is_selected: i.is_selected,
  }));
}

/**
 * Classify an Edit modal commit (onUpdateIllustrations) into the store write it implies. The modal
 * fires onUpdateIllustrations for BOTH a fresh edit AND any variant re-selection — a sketch page
 * image versions its variants with `is_selected`, so the two cases need different writes:
 *   • 'append' — the selected url is NOT among `existingUrls` → a genuinely new edited version;
 *                append it (addSketchSpreadImageVersion). Dedupe is against the WHOLE known list.
 *   • 'select' — the selected url IS an existing version → the user re-picked an older variant;
 *                flip is_selected (selectSketchSpreadImageVersion). Without this the re-selection
 *                was silently dropped and the sidebar highlight snapped back to the head version.
 *   • 'noop'   — empty list / no url on the selected (or first) entry.
 */
export type EditCommit =
  | { kind: 'append'; url: string }
  | { kind: 'select'; url: string }
  | { kind: 'noop' };

export function classifyEditCommit(
  next: Illustration[],
  existingUrls: readonly string[],
): EditCommit {
  const selected = next.find((i) => i.is_selected) ?? next[0];
  const url = selected?.media_url ?? null;
  if (!url) return { kind: 'noop' };
  return existingUrls.includes(url) ? { kind: 'select', url } : { kind: 'append', url };
}

/**
 * Adapt a sketch page image to the `SpreadImage` the Extract modal consumes. Only the fields the
 * crop tab needs are synthesized: stable `id`, the locked per-page `geometry`, the effective
 * `media_url` (source to crop), and the variant `illustrations`.
 */
export function toSpreadImage(
  sketchImg: SketchSpreadImage,
  geometry: Geometry,
  url: string | null,
): SpreadImage {
  return {
    id: sketchImg.id,
    geometry,
    media_url: url ?? undefined,
    illustrations: toIllustrations(sketchImg.illustrations),
  };
}
