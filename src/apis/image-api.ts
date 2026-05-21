import { callEdgeFunction } from './edge-function-client';
import { callImageApi, type ImageApiFailure } from './image-api-client';
import { createLogger } from '@/utils/logger';
import type { AspectRatio } from '@/constants/aspect-ratio-constants';
import type { ExtractedTrait, VisualProfileTrait } from '@/types/human';

export type { AspectRatio };

const log = createLogger('API', 'ImageApi');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL as string;
const imageApiKey = import.meta.env.VITE_IMAGE_API_KEY as string;

// --- New types: multipart FastAPI normalize-ratio ---

export interface NormalizeImageData {
  publicUrl: string;
  path: string;
  ratio: AspectRatio | null;
  mimeType: 'image/png' | 'image/gif' | 'image/svg+xml';
  srcDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  wasPadded: boolean;
  wasConverted: boolean;
  wasPassthrough: boolean;
}

export interface NormalizeImageMeta {
  processingTime?: number;
  paddedPixels?: number;
  inputBytes?: number;
  outputBytes?: number;
  sourceMimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/svg+xml';
}

export interface NormalizeImageSuccess {
  success: true;
  data: NormalizeImageData;
  meta?: NormalizeImageMeta;
}

export interface NormalizeImageFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode?: string;
  srcRatio?: number;
  minSupportedRatio?: number;
}

export type NormalizeImageResult = NormalizeImageSuccess | NormalizeImageFailure;

// --- Other types ---

export interface GenerateFromDescriptionParams {
  description: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateFromDescriptionResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Internal helpers ---

async function postMultipart<R extends { success: boolean }>(
  path: string,
  form: FormData,
): Promise<R | NormalizeImageFailure> {
  const url = `${imageApiBaseUrl}${path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      // Do NOT set Content-Type — browser adds multipart boundary automatically
      headers: { 'X-API-Key': imageApiKey },
      body: form,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let errorCode: string | undefined;
      let srcRatio: number | undefined;
      let minSupportedRatio: number | undefined;

      try {
        const body = await response.json() as Record<string, unknown>;
        const detail = body?.detail;
        const detailError =
          typeof detail === 'object' && detail !== null
            ? (detail as Record<string, unknown>).error as Record<string, unknown> | undefined
            : undefined;

        errorCode =
          (typeof detailError === 'object' && detailError !== null ? detailError.code as string | undefined : undefined) ??
          (typeof body?.error === 'object' && body.error !== null ? (body.error as Record<string, unknown>).code as string | undefined : undefined);

        message = (
          (typeof detailError === 'object' && detailError !== null && typeof detailError.message === 'string' ? detailError.message : null) ??
          (typeof detail === 'string' ? detail : null) ??
          (typeof body?.error === 'object' && body.error !== null
            ? ((body.error as Record<string, unknown>).message as string | undefined ?? JSON.stringify(body.error))
            : null) ??
          (typeof body?.error === 'string' ? body.error : null) ??
          (body?.message as string | undefined) ??
          `HTTP ${response.status}`
        );

        if (errorCode === 'IMAGE_TOO_TALL' && typeof detailError === 'object' && detailError !== null) {
          srcRatio = typeof detailError.srcRatio === 'number' ? detailError.srcRatio : undefined;
          minSupportedRatio = typeof detailError.minSupportedRatio === 'number' ? detailError.minSupportedRatio : undefined;
        }
      } catch { /* non-JSON body */ }

      log.error('postMultipart', 'http error', { path, errorCode, httpStatus: response.status });
      return { success: false, error: String(message), httpStatus: response.status, errorCode, srcRatio, minSupportedRatio };
    }

    const data = await response.json() as R;
    return data;
  } catch (err) {
    log.error('postMultipart', 'network error', { path, error: err });
    return { success: false, error: 'Network error. Please try again.', httpStatus: 0 };
  }
}

// --- API ---

/**
 * Upload image and normalize aspect ratio via FastAPI image-api (multipart, 1-step).
 * POST /api/image/normalize-ratio
 */
export async function normalizeImage(
  file: File,
  outputPrefix?: string,
): Promise<NormalizeImageResult> {
  log.info('normalizeImage', 'start', { filename: file.name, size: file.size, type: file.type, outputPrefix });

  const form = new FormData();
  form.append('file', file);
  if (outputPrefix) form.append('outputPrefix', outputPrefix);

  const result = await postMultipart<NormalizeImageSuccess>('/api/image/normalize-ratio', form);

  if (result.success) {
    log.debug('normalizeImage', 'ok', {
      path: result.data.path,
      ratio: result.data.ratio,
      wasPadded: result.data.wasPadded,
      wasPassthrough: result.data.wasPassthrough,
    });
  } else {
    log.error('normalizeImage', 'failed', { errorCode: result.errorCode, httpStatus: result.httpStatus });
  }

  return result;
}

export async function callGenerateFromDescription(
  params: GenerateFromDescriptionParams
): Promise<GenerateFromDescriptionResult> {
  log.info('callGenerateFromDescription', 'start', {
    descriptionLength: params.description.length,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateFromDescriptionResult>(
    'image-generate-from-description',
    params
  );
}

// --- Human visual-profile pipeline (normalize-human → extract-human-traits) ---

export type FaceToManyStyle = '3D' | 'Emoji' | 'Video Game' | 'Pixels' | 'Clay' | 'Toy';

export interface NormalizeHumanResponse {
  success: true;
  data: { imageUrl: string; storagePath: string };
}

export interface ExtractHumanTraitsResponse {
  success: true;
  data: { traits: ExtractedTrait[] };
}

/** Host-only for logging — never log full URL (may carry signed tokens). */
function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

/**
 * Stylize a real-person image into a normalized character reference (Replicate face-to-many).
 * POST /api/image/normalize-human
 */
export async function normalizeHuman(
  imageUrl: string,
  style: FaceToManyStyle = '3D',
): Promise<NormalizeHumanResponse | ImageApiFailure> {
  log.info('normalizeHuman', 'start', { host: urlHost(imageUrl), style });
  const result = await callImageApi<NormalizeHumanResponse>('/api/image/normalize-human', {
    imageUrl,
    style,
  });
  if (result.success) {
    log.debug('normalizeHuman', 'ok', { host: urlHost(result.data.imageUrl) });
  } else {
    log.error('normalizeHuman', 'failed', { errorCode: result.errorCode, httpStatus: result.httpStatus });
  }
  return result;
}

/**
 * Extract 5 fixed visual traits from a real-person image (Gemini multimodal vision).
 * POST /api/image/extract-human-traits
 */
export async function extractHumanTraits(
  imageUrl: string,
  descriptionLanguage: 'en' | 'vi' = 'en',
): Promise<ExtractHumanTraitsResponse | ImageApiFailure> {
  log.info('extractHumanTraits', 'start', { host: urlHost(imageUrl), descriptionLanguage });
  const result = await callImageApi<ExtractHumanTraitsResponse>('/api/image/extract-human-traits', {
    imageUrl,
    descriptionLanguage,
  });
  if (result.success) {
    log.debug('extractHumanTraits', 'ok', { count: result.data.traits.length });
  } else {
    log.error('extractHumanTraits', 'failed', { errorCode: result.errorCode, httpStatus: result.httpStatus });
  }
  return result;
}

/** Map API trait shape → persisted DB shape: drop `present`, null-out description when absent, reserve image_url. */
export function toStoredTraits(apiTraits: ExtractedTrait[]): VisualProfileTrait[] {
  return apiTraits.map((t) => ({
    type: t.type,
    description: t.present ? t.description : null,
    image_url: null,
  }));
}
