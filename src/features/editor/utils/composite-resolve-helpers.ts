// composite-resolve-helpers.ts - Pure runtime helpers for SpreadComposite override resolution.
//
// Scope (Phase 6 — reduced per Validation D5):
//   - z-index override only (visibility cascade write-through is handled at the
//     store level in `updateRetouchComposite`; variant.editor_visible /
//     variant.player_visible reflect cascaded state — no runtime resolver needed).
//   - Player edition filter: only the variant matching the active `playEdition`
//     contributes a context entry; off-edition variants are absent from the map
//     and the consumer skips render.
//   - Animation target resolution: `target.type === 'composite'` resolves to the
//     active variant id and signals `bypassMotion` for `playEdition === 'classic'`.
//
// Purity: no React imports, no logger here — callers add `log.debug` at the
// integration site so payloads can stay component-scoped.

import type {
  BaseSpread,
  SpreadAnimation,
  SpreadComposite,
  EditionTag,
  Geometry,
} from '@/types/spread-types';
import type { PlayEdition } from '@/types/playable-types';

/** Per-variant runtime context derived from the composite it belongs to.
 *  Build once per spread (or per spread × edition) and reuse across renders. */
export interface CompositeContext {
  compositeId: string;
  /** Edition tag the variant claims within the composite. For player maps this
   *  always matches the active `playEdition`; for editor maps it is the first
   *  edition slot the variant id appears under. */
  edition: EditionTag;
  override: {
    'z-index': number;
  };
}

/** Editor-side map: every variant id from every composite gets one entry.
 *  Used by editor canvas render handlers to apply z-index override regardless
 *  of edition. Visibility is NOT resolved here — variant's own
 *  `editor_visible` field already reflects cascade via Phase 1 store
 *  write-through. */
export function buildEditorCompositeContextMap(
  spread: Pick<BaseSpread, 'composites'>
): Map<string, CompositeContext> {
  const map = new Map<string, CompositeContext>();
  const composites = spread.composites ?? [];
  for (const composite of composites) {
    for (const variant of composite.variants) {
      // First-wins: when a variant id appears in multiple edition slots of the
      // same composite, only the first occurrence is registered (matches spec
      // "1 entry per variant id").
      if (map.has(variant.id)) continue;
      map.set(variant.id, {
        compositeId: composite.id,
        edition: variant.edition,
        override: { 'z-index': composite['z-index'] },
      });
    }
  }
  return map;
}

/** Player-side map: only the variant matching the active `playEdition`
 *  contributes an entry. Variants from other editions are intentionally absent
 *  so the consumer can detect "in any composite but skip render". */
export function buildPlayerCompositeContextMap(
  spread: Pick<BaseSpread, 'composites'>,
  playEdition: PlayEdition
): Map<string, CompositeContext> {
  const map = new Map<string, CompositeContext>();
  const composites = spread.composites ?? [];
  for (const composite of composites) {
    const active = composite.variants.find((v) => v.edition === playEdition);
    if (!active) continue; // composite has no slot for this edition → skip
    if (map.has(active.id)) continue; // variant already mapped from another composite (degenerate, but stay 1:1)
    map.set(active.id, {
      compositeId: composite.id,
      edition: active.edition,
      override: { 'z-index': composite['z-index'] },
    });
  }
  return map;
}

/** Map variant id → 1-based ordinal of the composite within `spread.composites[]`.
 *  Used to render the small "1", "2", … badge on canvas variants so users can see
 *  which items belong to the same group. */
export function buildCompositeNumberMap(
  composites: SpreadComposite[]
): Map<string, number> {
  const map = new Map<string, number>();
  composites.forEach((composite, idx) => {
    composite.variants.forEach((v) => map.set(v.id, idx + 1));
  });
  return map;
}

/** Reverse-scan `composites[]` to find the composite owning a given variant id.
 *  Returns the composite id or `null` if the variant is not in any composite. */
export function findCompositeIdForVariant(
  composites: SpreadComposite[],
  variantId: string
): string | null {
  for (const composite of composites) {
    if (composite.variants.some((v) => v.id === variantId)) return composite.id;
  }
  return null;
}

/** Lookup helper: returns composite z-index when item belongs to a composite,
 *  otherwise the item's own z-index. Caller passes the appropriate map (editor
 *  vs player). */
export function resolveEffectiveZIndex(
  item: { id: string; 'z-index'?: number },
  ctxMap: Map<string, CompositeContext>
): number {
  const ctx = ctxMap.get(item.id);
  if (ctx) return ctx.override['z-index'];
  return item['z-index'] ?? 0;
}

/** True if the variant belongs to ANY composite on the spread. Used by the
 *  player canvas to decide between "skip render" (in composite, off-edition)
 *  vs "render as standalone" (not in any composite). */
export function isVariantInAnyComposite(
  spread: Pick<BaseSpread, 'composites'>,
  variantId: string
): boolean {
  const composites = spread.composites ?? [];
  for (const c of composites) {
    if (c.variants.some((v) => v.id === variantId)) return true;
  }
  return false;
}

/** Resolution outcome for an animation whose target may be a composite. */
export interface ResolvedAnimationTarget {
  /** Variant id to apply tween onto. Empty string → skip animation. */
  variantId: string;
  /** When true, the engine should render the variant at its final state and
   *  skip motion (classic edition). Always false for non-composite targets. */
  bypassMotion: boolean;
}

/**
 * Resolve the geometry of an animation target item on a spread.
 *
 * Returns null when:
 *   - target.type === 'spread' (Camera Zoom sentinel — not an item)
 *   - target.type === 'audio' | 'quiz' (no Geometry; uses 2D point or fixed icon)
 *   - target item not found (orphan — animation references deleted item)
 *   - target.type === 'composite' but composite missing or has no variants
 *
 * Composite resolution: when `playEdition` is supplied, returns the active
 * variant's geometry; otherwise (editor canvas — edition-agnostic) returns the
 * first variant's geometry. Underlying image/auto_pic is looked up on the spread.
 */
export function resolveTargetItemGeometry(
  target: SpreadAnimation['target'],
  spread: BaseSpread | null | undefined,
  playEdition?: PlayEdition,
): Geometry | null {
  if (!spread) return null;
  if (target.type === 'spread' || target.type === 'audio' || target.type === 'quiz') {
    return null;
  }
  if (target.type === 'composite') {
    const composite = spread.composites?.find((c) => c.id === target.id);
    if (!composite || composite.variants.length === 0) return null;
    const variant = playEdition
      ? composite.variants.find((v) => v.edition === playEdition) ?? composite.variants[0]
      : composite.variants[0];
    if (variant.type === 'image') {
      return spread.images?.find((i) => i.id === variant.id)?.geometry ?? null;
    }
    return spread.auto_pics?.find((p) => p.id === variant.id)?.geometry ?? null;
  }
  switch (target.type) {
    case 'image':
      return spread.images?.find((i) => i.id === target.id)?.geometry ?? null;
    case 'shape':
      return spread.shapes?.find((s) => s.id === target.id)?.geometry ?? null;
    case 'video':
      return spread.videos?.find((v) => v.id === target.id)?.geometry ?? null;
    case 'auto_pic':
      return spread.auto_pics?.find((p) => p.id === target.id)?.geometry ?? null;
    case 'textbox': {
      // textboxes use language-specific content geometry; fallback to first lang's geometry.
      const tb = spread.textboxes?.find((t) => t.id === target.id);
      if (!tb) return null;
      // SpreadTextbox.contents is keyed by language code with { geometry, ... } values.
      // We pull the first content's geometry as a fallback (callers needing
      // language-correct geometry should resolve via getTextboxContentForLanguage).
      const contents = (tb as { contents?: Record<string, { geometry?: Geometry }> }).contents;
      if (!contents) return null;
      const firstKey = Object.keys(contents)[0];
      return firstKey ? contents[firstKey]?.geometry ?? null : null;
    }
    default:
      return null;
  }
}

/** Resolve `animation.target` to a concrete variant id under the active
 *  `playEdition`. Non-composite targets pass through unchanged. */
export function resolveAnimationTarget(
  target: { id: string; type: string },
  spread: Pick<BaseSpread, 'composites'>,
  playEdition: PlayEdition
): ResolvedAnimationTarget {
  if (target.type !== 'composite') {
    return { variantId: target.id, bypassMotion: false };
  }
  const composites: SpreadComposite[] = spread.composites ?? [];
  const composite = composites.find((c) => c.id === target.id);
  if (!composite) return { variantId: '', bypassMotion: false };
  const active = composite.variants.find((v) => v.edition === playEdition);
  if (!active) return { variantId: '', bypassMotion: false };
  return {
    variantId: active.id,
    bypassMotion: playEdition === 'classic',
  };
}
