// extract-image-modal-utils.ts — Pure I/O + mapping helpers for ExtractImageModal
// (README §2.8 / §4.2). Generalizes the deleted split/segment modal logic:
//   • resolveSourceImageUrl — same source-URL priority both old modals used.
//   • uploadEphemeralToStorage — fetch ephemeral URL → Blob → File → Storage (split flow).
//   • mapExtractError — ImageApiFailure.errorCode → user-facing English message.
// No store access — pure I/O + mapping so the modal stays reusable + testable.

import { uploadImageToStorage } from '@/apis/storage-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import { createLogger } from '@/utils/logger';
import type { SpreadImage } from '@/types/spread-types';
import type { ExtractResult } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractImageModalUtils');

/** Storage category folder for committed extract results (design §4.2). */
const EXTRACT_RESULTS_FOLDER = 'extract-results';

/** Source URL priority: final_hires > selected illustration > first illustration > media_url.
 *  Mirrors `resolveImageUrl` from the deleted segment/split modals so extraction runs on the
 *  same pixels the canvas shows. */
export function resolveSourceImageUrl(image: SpreadImage): string | undefined {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((i) => i.is_selected);
  if (selected) return selected.media_url;
  if (image.illustrations?.[0]) return image.illustrations[0].media_url;
  return image.media_url;
}

/** Upload one ephemeral result to Storage and return it with a permanent publicUrl.
 *  fetch ephemeral → Blob → File (ext from MIME) → uploadImageToStorage(folder). */
export async function uploadEphemeralToStorage(result: ExtractResult): Promise<ExtractResult> {
  log.debug('uploadEphemeralToStorage', 'start', {
    resultId: result.id,
    sourceTab: result.sourceTab,
  });
  const response = await fetch(result.media_url);
  const blob = await response.blob();
  const ext = blob.type.split('/')[1] || 'png';
  const file = new File([blob], `${result.id}.${ext}`, { type: blob.type });
  const { publicUrl } = await uploadImageToStorage(file, EXTRACT_RESULTS_FOLDER);
  log.debug('uploadEphemeralToStorage', 'done', { resultId: result.id });
  return { ...result, media_url: publicUrl };
}

/** Map an ImageApiFailure to a user-facing English message keyed on errorCode
 *  (segment 422 EMPTY_SEGMENTATION / layers 429 REPLICATE_RATE_LIMIT / 504 TIMEOUT). */
export function mapExtractError(failure: ImageApiFailure): string {
  switch (failure.errorCode) {
    case 'EMPTY_SEGMENTATION':
      return 'No object matched your prompt. Try a different one.';
    case 'REPLICATE_RATE_LIMIT':
      return 'Server busy, try again shortly.';
    case 'TIMEOUT':
      return 'The request timed out. Please try again.';
    default:
      return failure.error || 'Extraction failed. Please try again.';
  }
}
