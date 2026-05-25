// crop-grouping.ts — Group an illustration's tagged layers by entity key into
// engine-ready crop inputs + source metadata.
//
// `groupCropsForKey` scans `illustration.spreads[].images[]` (image layers
// ONLY — auto_pic/video/audio layers are excluded), collects layers whose
// subject tags match the given key/type, resolves an effective image URL,
// and returns two things:
//   - `cropInputs`     — CropInput[] for crop-sheet-layout-engine.
//   - `cropMetaById`   — RemixCrop metadata keyed by layer id (for the P4
//                        merge step that writes engine placement geometry).
//                        Carries source identity `id` (image layer id) +
//                        `spread_id` — mandated persist per DB-CHANGELOG
//                        2026-05-25 (`layer_id` renamed → `id`).
//
// IMPORTANT — two distinct geometry concepts:
//   - `CropInput.widthPct/heightPct` is the SOURCE layer geometry (% of the
//     spread). It is read here at grouping time, BEFORE the layout engine runs.
//   - `RemixCrop.geometry` is the engine OUTPUT (px, sheet-relative). It is a
//     placeholder ({0,0,0,0}) here and gets overwritten in P4. We never persist
//     widthPct/heightPct on RemixCrop — re-layout re-scans the (frozen)
//     illustration as the single source of truth.
//
// Pure: scans the in-memory illustration, no I/O. Uses a logger (caller-facing
// util — logs warnings for bad input, unlike the pure engine).
//
// Spec: ai-storybook-design/component/stores/remix-store.md §6.5
//       ai-storybook-design/component/editor-page/remix-creative-space/05-05-crop-sheet-layout-engine.md §6

import type { RemixIllustration, RemixCrop } from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import type { CropInput } from '@/utils/crop-sheet-layout-engine';
import {
  iterTaggedLayers,
  subjectTagsOf,
  spreadNumberOf,
  geometryOf,
  mixLineupTokens,
  type TaggedLayer,
  type MixCastMember,
} from '@/stores/remix-store/clone-builder';
import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'CropGrouping');

/** Entity classification — `type` decides single-subject vs mix matching. */
export type CropGroupType = 'character' | 'prop' | 'mix';

export interface GroupCropsResult {
  /** Engine input, in scan order. */
  cropInputs: CropInput[];
  /** Source crop metadata keyed by layer id — P4 merges engine geometry in. */
  cropMetaById: Record<string, RemixCrop>;
}

/**
 * Resolve the best display URL for a tagged layer.
 * Priority: final_hires_media_url → selected illustration → first illustration
 * → media_url. Returns '' when nothing is available.
 *
 * Only SpreadImage carries `final_hires_media_url`/`illustrations`; other
 * tagged-layer kinds expose `media_url` only — accessed optionally below.
 */
export function resolveEffectiveUrl(layer: TaggedLayer): string {
  const img = layer as {
    final_hires_media_url?: string;
    illustrations?: Array<{ media_url: string; is_selected: boolean }>;
    media_url?: string;
  };

  if (img.final_hires_media_url) return img.final_hires_media_url;

  const illustrations = img.illustrations ?? [];
  const selected = illustrations.find((i) => i.is_selected);
  if (selected?.media_url) return selected.media_url;
  if (illustrations[0]?.media_url) return illustrations[0].media_url;

  return img.media_url ?? '';
}

/** Enabled-cast context for grouping — sourced from the remix settings (config
 *  / persisted row), NOT the raw illustration tags. This is what makes grouping
 *  respect swap-enabled state: disabled subjects are dropped before a layer is
 *  classified single-vs-mix. */
export interface GroupCropsContext {
  /** Swap-enabled entity keys (characters + props). */
  enabledKeys: Set<string>;
  /** Full enabled cast (chars then props) with base variants — needed to
   *  compute a layer's variant-lineup identity for mix matching. */
  cast: MixCastMember[];
}

/**
 * Group crops of one entity key from the illustration, respecting swap-enabled
 * state. Disabled subjects are dropped from each layer first, then the layer is
 * classified by the count of ENABLED subject tags (mirrors clone-builder):
 *   - 0 enabled            → skip
 *   - 1 enabled            → single-subject crop for that entity (this is the
 *                            fold: a didi+leela layer with only didi enabled
 *                            becomes a didi crop)
 *   - ≥2 enabled           → mix; matches when the canonical full-cast variant
 *                            lineup equals `key`
 *
 * @param illustration  Frozen remix illustration (post-create source of truth).
 * @param type          'character' | 'prop' — 1-enabled match; 'mix' — ≥2.
 * @param key           Native entity key, or canonicalMixKey(lineup) for a mix.
 * @param ctx           Enabled cast from settings (see GroupCropsContext).
 */
export function groupCropsForKey(
  illustration: RemixIllustration,
  type: CropGroupType,
  key: string,
  ctx: GroupCropsContext,
): GroupCropsResult {
  log.info('groupCropsForKey', 'start', { type, key });

  const cropInputs: CropInput[] = [];
  const cropMetaById: Record<string, RemixCrop> = {};

  for (const spread of illustration.spreads) {
    const spreadNumber = spreadNumberOf(spread);

    for (const { layer, kind } of iterTaggedLayers(spread)) {
      // Crop sheets are static-image crops only. Skip auto_pic (.lottie/.riv/
      // .webm animations), video and audio layers — they can't render in an
      // <img> compose nor be AI-swapped. Spec: remix-store.md §6.5.
      if (kind !== 'image') continue;

      const subjectTags = subjectTagsOf(layer);
      // Drop disabled subjects FIRST — grouping keys come from settings, not raw
      // tags. A co-occurrence collapses to whatever stays swap-enabled.
      const enabledTags = subjectTags.filter((t) => ctx.enabledKeys.has(t.object_key));
      if (enabledTags.length === 0) continue;

      // Classify by enabled-tag count: ≥2 → mix (match by full-cast variant
      // lineup); exactly 1 → single-subject crop for that entity (the fold).
      let matched = false;
      if (type === 'mix') {
        matched =
          enabledTags.length >= 2 &&
          canonicalMixKey(mixLineupTokens(enabledTags, ctx.cast)) === key;
      } else {
        matched =
          enabledTags.length === 1 &&
          enabledTags[0].type === type &&
          enabledTags[0].object_key === key;
      }
      if (!matched) continue;

      // Source layer geometry (% of spread) — engine input, NOT persisted.
      const g = geometryOf(layer);
      if (g.w <= 0 || g.h <= 0) {
        log.warn('groupCropsForKey', 'crop geometry invalid — skip', {
          key,
          id: layer.id,
          w: g.w,
          h: g.h,
        });
        continue;
      }

      const url = resolveEffectiveUrl(layer);
      if (!url) {
        log.warn('groupCropsForKey', 'crop has empty url', { key, id: layer.id });
      }

      // name/variant follow clone-builder, over ENABLED tags only: single →
      // variant_key; mix → enabled variant_keys joined with '+'.
      const variant =
        type === 'mix'
          ? enabledTags.map((t) => t.variant_key ?? '').join('+')
          : (enabledTags[0]?.variant_key ?? '');

      cropInputs.push({
        id: layer.id,
        widthPct: g.w,
        heightPct: g.h,
      });
      cropMetaById[layer.id] = {
        // Source identity — mandated persist (DB-CHANGELOG 2026-05-25). `id` =
        // image layer id (echoes engine `placement.id`); `spread_id` = source
        // spread id (metadata only, engine ignores it). Both flow through to
        // the persisted `crops[]` so remix API 01/02 receive them verbatim.
        id: layer.id,
        spread_id: spread.id,
        spread_number: spreadNumber,
        aspect_ratio: (layer as { aspect_ratio?: string }).aspect_ratio ?? '1:1',
        name: variant,
        variant,
        media_url: url,
        // Placeholder — overwritten with engine placement geometry in P4.
        geometry: { x: 0, y: 0, w: 0, h: 0 },
        'z-index': (layer as { 'z-index'?: number })['z-index'] ?? 0,
      };
    }
  }

  log.debug('groupCropsForKey', 'done', { key, cropCount: cropInputs.length });
  return { cropInputs, cropMetaById };
}
