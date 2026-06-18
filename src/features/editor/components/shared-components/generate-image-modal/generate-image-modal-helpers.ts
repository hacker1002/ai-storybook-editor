// generate-image-modal-helpers.ts — Pure helpers for the Creating-Image workspace.
// Moved out of the old flat modal (flattenStageVariants / resolveStageVariantImageUrl)
// + the new upload-refit geometry helper. Kept pure (no React) so they are unit-testable.

import type { Stage } from '@/types/stage-types';

/** A flattened stage→variant option for the Stage Setting grid. `ref` is the
 *  `@stage_key/variant_key` mention (null = the "None" option). */
export interface FlatStageVariant {
  ref: string | null;
  label: string;
  thumbnail_url: string | null;
}

/** Flattens stages → [None, ...stage/variant] options (selected illustration thumb, else first). */
export function flattenStageVariants(stages: Stage[]): FlatStageVariant[] {
  const options: FlatStageVariant[] = [{ ref: null, label: 'None', thumbnail_url: null }];
  for (const stage of stages) {
    for (const variant of stage.variants) {
      const selectedIll = variant.illustrations.find((ill) => ill.is_selected);
      options.push({
        ref: `@${stage.key}/${variant.key}`,
        label: `${stage.name} - ${variant.name}`,
        thumbnail_url: selectedIll?.media_url ?? variant.illustrations[0]?.media_url ?? null,
      });
    }
  }
  return options;
}

/** Resolves the reference image URL for a `@stage_key/variant_key` mention (selected, else first). */
export function resolveStageVariantImageUrl(
  ref: string | null,
  stages: Stage[],
): string | undefined {
  if (!ref) return undefined;
  const match = ref.match(/^@([^/]+)\/(.+)$/);
  if (!match) return undefined;
  const [, stageKey, variantKey] = match;
  const stage = stages.find((s) => s.key === stageKey);
  const variant = stage?.variants.find((v) => v.key === variantKey);
  return (
    variant?.illustrations.find((ill) => ill.is_selected)?.media_url ??
    variant?.illustrations[0]?.media_url
  );
}

// NOTE: upload-mode geometry refit reuses the canonical, canvas-aware
// `calculateGeometryForRatio` (utils/aspect-ratio-utils.ts) — the same path the
// spreads/objects image toolbars use. A bespoke "bound-longest" helper was dropped
// (code review C1): Geometry w/h are % on a NON-square canvas, so a refit MUST divide
// the target ratio by canvasAspectRatio; the canonical helper already does this.
