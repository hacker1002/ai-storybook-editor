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

/** Storage category folder for crop-on-extract objects (Objects tab, design §6). */
const EXTRACT_OBJECTS_FOLDER = 'extract-objects';

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

/** Upload one crop-on-extract base64 data URL to Storage; returns the public URL.
 *  Objects-tab Extract path (design §6): `data:<mime>;base64,<payload>` → File → Storage. */
export async function uploadCroppedToStorage(
  base64DataUrl: string,
  folder: string = EXTRACT_OBJECTS_FOLDER,
): Promise<string> {
  const match = /^data:([^;]+);base64,(.*)$/.exec(base64DataUrl);
  const mimeType = match?.[1] ?? 'image/png';
  const payload = match?.[2] ?? base64DataUrl;
  const ext = mimeType.split('/')[1] || 'png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], `${crypto.randomUUID()}.${ext}`, { type: mimeType });
  log.debug('uploadCroppedToStorage', 'start', { folder, bytes: bytes.length, mimeType });
  const { publicUrl } = await uploadImageToStorage(file, folder);
  log.debug('uploadCroppedToStorage', 'done', { folder });
  return publicUrl;
}

/** Map an ImageApiFailure to a user-facing English message keyed on errorCode
 *  (segment 422 EMPTY_SEGMENTATION / layers 429 REPLICATE_RATE_LIMIT / 504 TIMEOUT;
 *  Objects detect 404/422/502 + crop EMPTY_CROP_RESULT — see 07/05 specs). */
export function mapExtractError(failure: ImageApiFailure): string {
  switch (failure.errorCode) {
    case 'EMPTY_SEGMENTATION':
      return 'No object matched your prompt. Try a different one.';
    case 'REPLICATE_RATE_LIMIT':
      return 'Server busy, try again shortly.';
    case 'TIMEOUT':
      return 'The request timed out. Please try again.';
    case 'SNAPSHOT_NOT_FOUND':
      return 'Scene data not found. Try reopening the editor.';
    case 'LLM_ERROR':
      return 'Object detection is busy. Please try again shortly.';
    case 'LLM_PARSE_ERROR':
      return 'Could not read the detection result. Please try again.';
    case 'IMAGE_FETCH_ERROR':
      return 'Could not load the source image. Please try again.';
    case 'DECODE_ERROR':
      return 'The source image could not be processed.';
    case 'EMPTY_CROP_RESULT':
      return 'No crop produced. Make the crop area larger and try again.';
    case 'UNSUPPORTED_MODEL':
      return 'The selected detection model is not available.';
    default:
      return failure.error || 'Extraction failed. Please try again.';
  }
}
