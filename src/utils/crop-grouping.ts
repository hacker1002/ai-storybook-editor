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
  type TaggedLayer,
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

/**
 * Group crops of one entity key from the illustration.
 *
 * @param illustration  Frozen remix illustration (post-create source of truth).
 * @param type          'character' | 'prop' — single-subject match;
 *                       'mix' — layers with ≥2 subject tags whose
 *                       canonicalMixKey equals `key`.
 * @param key           Native entity key, or canonicalMixKey for a mix.
 */
export function groupCropsForKey(
  illustration: RemixIllustration,
  type: CropGroupType,
  key: string,
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

      // Classify: mix matches ≥2 tags by canonical key; character/prop matches
      // exactly one tag of the right type + key (mirrors clone-builder).
      let matched = false;
      if (type === 'mix') {
        matched =
          subjectTags.length >= 2 &&
          canonicalMixKey(subjectTags.map((t) => t.object_key)) === key;
      } else {
        matched =
          subjectTags.length === 1 &&
          subjectTags[0].type === type &&
          subjectTags[0].object_key === key;
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

      // name/variant follow clone-builder: single tag → variant_key;
      // mix → all variant_keys joined with '+'.
      const variant =
        type === 'mix'
          ? subjectTags.map((t) => t.variant_key ?? '').join('+')
          : (subjectTags[0]?.variant_key ?? '');

      cropInputs.push({
        id: layer.id,
        widthPct: g.w,
        heightPct: g.h,
      });
      cropMetaById[layer.id] = {
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
