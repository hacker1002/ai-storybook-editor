// apply-final-crops.ts — Pure helper for Inject (Phase 3, client-side finalize).
//
// Given an illustration blob + the resolved is_final winner crops, produce a NEW
// illustration `spreads[]` where each layer is finalized per spec (api/remix/
// inject.md §Apply):
//   • swapped layer (matches a final crop on `${spread_id}/${layer_id}`):
//       - final_hires_media_url = crop.media_url
//       - illustrations[] collapsed to a single selected element
//         [{ media_url: crop.media_url, created_time: nowISO, is_selected: true }]
//   • unswapped layer with illustrations.length > 1:
//       - slim illustrations[] to the single is_selected element (or first +warn)
//   • uncovered layer (no crop, single/zero illustrations): left UNCHANGED.
//
// Sketch `media_url` is NEVER touched (unreachable via resolution order).
// Pure: does NOT mutate the input (structuredClone of spreads).

import type { RemixIllustration, RemixSpread } from '@/types/remix';
import type { SpreadImage } from '@/types/spread-types';
import type { FinalCropEntry } from './selectors/select-final-crops';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ApplyFinalCrops');

/** A single illustration variant entry (inline shape of SpreadImage.illustrations[]). */
type IllustrationVariant = NonNullable<SpreadImage['illustrations']>[number];

export interface ApplyFinalCropsResult {
  spreads: RemixSpread[];
  appliedCount: number;
  collapsedCount: number;
  spreadCount: number;
}

/**
 * Apply resolved final crops onto a copy of the illustration spreads.
 * @param illustration source blob (NOT mutated)
 * @param finals       winner crops, one per (spread_id, layer_id)
 * @param nowISO       timestamp written to collapsed illustration entries
 */
export function applyFinalCrops(
  illustration: RemixIllustration,
  finals: FinalCropEntry[],
  nowISO: string,
): ApplyFinalCropsResult {
  const fnName = 'applyFinalCrops';
  log.info(fnName, 'apply final crops', {
    spreadCount: illustration.spreads.length,
    finalsCount: finals.length,
  });

  // Index finals by `${spread_id}/${layer_id}` for O(1) layer lookup.
  const finalsByLayer = new Map<string, FinalCropEntry>();
  for (const f of finals) {
    finalsByLayer.set(`${f.spread_id}/${f.layer_id}`, f);
  }

  // Deep clone so the input illustration stays untouched (purity contract).
  const spreads = structuredClone(illustration.spreads) as RemixSpread[];

  let appliedCount = 0;
  let collapsedCount = 0;

  for (const spread of spreads) {
    const images: SpreadImage[] = spread.images ?? [];
    for (const layer of images) {
      const key = `${spread.id}/${layer.id}`;
      const crop = finalsByLayer.get(key);

      if (crop) {
        // Swapped layer → write final hi-res + collapse illustrations to 1.
        layer.final_hires_media_url = crop.media_url;
        const collapsed: IllustrationVariant = {
          media_url: crop.media_url,
          created_time: nowISO,
          is_selected: true,
        };
        layer.illustrations = [collapsed];
        appliedCount++;
        collapsedCount++;
        log.debug(fnName, 'layer swapped + collapsed', { key });
        continue;
      }

      // Unswapped layer → slim illustrations[] to the single selected element.
      const illos = layer.illustrations ?? [];
      if (illos.length > 1) {
        let selected = illos.find((i) => i.is_selected);
        if (!selected) {
          log.warn(fnName, 'no selected illustration; keeping first', {
            key,
            count: illos.length,
          });
          selected = illos[0];
        }
        layer.illustrations = [selected];
        collapsedCount++;
        log.debug(fnName, 'layer slimmed (unswapped)', { key });
        continue;
      }

      // Uncovered layer (no crop, <=1 illustration) → left unchanged.
      log.debug(fnName, 'layer unchanged', { key });
    }
  }

  log.info(fnName, 'apply complete', {
    appliedCount,
    collapsedCount,
    spreadCount: spreads.length,
  });

  return {
    spreads,
    appliedCount,
    collapsedCount,
    spreadCount: spreads.length,
  };
}
