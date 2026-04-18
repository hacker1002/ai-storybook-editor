// storage-api.ts - Upload files to Supabase Storage (storybook-assets bucket)

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import {
  type AspectRatio,
  MIN_SUPPORTED_RATIO,
} from '@/constants/aspect-ratio-constants';
import {
  findExactRatioMatch,
  getImageNaturalDimensions,
} from '@/utils/aspect-ratio-utils';
import { callNormalizeRatio } from './image-api';

const log = createLogger('API', 'Storage');

const BUCKET = 'storybook-assets';

const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

const VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const AUDIO_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'];

const ANIMATED_PIC_MAX_SIZE = 50 * 1024 * 1024; // 50MB — webm HD; .gif blocked (validation session 1)
const ANIMATED_PIC_TYPES = ['image/webp', 'video/webm'];

export interface UploadResult {
  publicUrl: string;
  path: string;
  ratio?: AspectRatio;
}

async function uploadToStorage(
  file: File,
  allowedTypes: string[],
  maxSize: number,
  pathPrefix: string,
  fnName: string,
  // When provided, skips MIME validation (caller has validated by extension) and uses this content type
  validatedContentType?: string,
): Promise<UploadResult> {
  if (!validatedContentType && !allowedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`);
  }
  if (file.size > maxSize) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${maxSize / 1024 / 1024}MB`);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${pathPrefix}/${Date.now()}-${sanitizedName}`;

  log.info(fnName, 'uploading', { path: filePath, size: file.size, type: validatedContentType ?? file.type });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      contentType: validatedContentType ?? file.type,
      upsert: false,
    });

  if (error) {
    log.error(fnName, 'upload failed', { path: filePath, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  log.info(fnName, 'upload complete', { publicUrl: urlData.publicUrl });

  return { publicUrl: urlData.publicUrl, path: data.path };
}

export async function uploadImageToStorage(file: File, pathPrefix = 'uploads'): Promise<UploadResult> {
  return uploadToStorage(file, IMAGE_TYPES, IMAGE_MAX_SIZE, pathPrefix, 'uploadImageToStorage');
}

export async function uploadVideoToStorage(file: File, pathPrefix = 'videos'): Promise<UploadResult> {
  return uploadToStorage(file, VIDEO_TYPES, VIDEO_MAX_SIZE, pathPrefix, 'uploadVideoToStorage');
}

export async function uploadAudioToStorage(file: File, pathPrefix = 'audios'): Promise<UploadResult> {
  return uploadToStorage(file, AUDIO_TYPES, AUDIO_MAX_SIZE, pathPrefix, 'uploadAudioToStorage');
}

export async function uploadAnimatedPicToStorage(file: File, pathPrefix = 'animated-pics'): Promise<UploadResult> {
  const lowerName = file.name.toLowerCase();
  // .lottie/.riv have no standard MIME type — browsers report empty string or application/octet-stream.
  // Validate by extension here; pass validatedContentType to skip MIME check in uploadToStorage.
  if (lowerName.endsWith('.lottie') || lowerName.endsWith('.riv')) {
    return uploadToStorage(file, ANIMATED_PIC_TYPES, ANIMATED_PIC_MAX_SIZE, pathPrefix, 'uploadAnimatedPicToStorage', 'application/octet-stream');
  }
  return uploadToStorage(file, ANIMATED_PIC_TYPES, ANIMATED_PIC_MAX_SIZE, pathPrefix, 'uploadAnimatedPicToStorage');
}

// --- Normalize-ratio upload flow ---

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const PASSTHROUGH_MIME = new Set(['image/gif', 'image/svg+xml']);

export class ImageTooTallError extends Error {
  readonly srcRatio: number;
  constructor(srcRatio: number) {
    super(`Image too tall: ratio ${srcRatio.toFixed(4)} is below minimum ${MIN_SUPPORTED_RATIO.toFixed(4)} (9:16). Please crop and try again.`);
    this.name = 'ImageTooTallError';
    this.srcRatio = srcRatio;
  }
}

async function fastPathUpload(file: File, outputPrefix: string, ratio: AspectRatio | undefined): Promise<UploadResult> {
  const ext = MIME_TO_EXT[file.type] ?? 'bin';
  const uuid = crypto.randomUUID();
  const filePath = `${outputPrefix}/${Date.now()}-${uuid}.${ext}`;

  log.info('fastPathUpload', 'uploading', { path: filePath, type: file.type, size: file.size });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (error) {
    log.error('fastPathUpload', 'upload failed', { path: filePath, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  log.info('fastPathUpload', 'upload complete', { path: data.path });

  return { publicUrl: urlData.publicUrl, path: data.path, ratio };
}

/**
 * Upload image with client-side pre-check to avoid unnecessary edge fn round-trips.
 * GIF/SVG → fast-path (passthrough). Exact-ratio JPEG/PNG/WebP → fast-path.
 * Too-tall images → blocked client-side (ImageTooTallError). Others → slow-path via edge fn.
 * Preserves `uploadImageToStorage` signature — `UploadResult.ratio` is an additive optional field.
 */
export async function uploadImageToStorageWithNormalize(
  file: File,
  outputPrefix = 'uploads',
): Promise<UploadResult> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: ${IMAGE_TYPES.join(', ')}`);
  }
  if (file.size > IMAGE_MAX_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${IMAGE_MAX_SIZE / 1024 / 1024}MB`);
  }

  // GIF/SVG: edge fn passthrough — skip round-trip entirely
  if (PASSTHROUGH_MIME.has(file.type)) {
    log.info('uploadImageToStorageWithNormalize', 'fast-path:passthrough', { type: file.type });
    return fastPathUpload(file, outputPrefix, undefined);
  }

  // Read natural dims for ratio pre-check; fall back to slow-path if decode fails
  let dims: { width: number; height: number } | null = null;
  try {
    dims = await getImageNaturalDimensions(file);
  } catch (err) {
    log.warn('uploadImageToStorageWithNormalize', 'dim read failed, falling back to slow-path', { error: err });
  }

  if (dims) {
    const srcRatio = dims.width / dims.height;

    if (srcRatio < MIN_SUPPORTED_RATIO) {
      log.debug('uploadImageToStorageWithNormalize', 'blocked:too-tall', { srcRatio });
      throw new ImageTooTallError(srcRatio);
    }

    const exactLabel = findExactRatioMatch(srcRatio);
    if (exactLabel) {
      log.info('uploadImageToStorageWithNormalize', 'fast-path:exact-ratio', { srcRatio, label: exactLabel });
      return fastPathUpload(file, outputPrefix, exactLabel);
    }
  }

  // Slow-path: upload raw → edge fn normalize
  const ext = MIME_TO_EXT[file.type] ?? 'bin';
  const uuid = crypto.randomUUID();
  const rawPath = `uploads/_raw/${uuid}.${ext}`;

  log.info('uploadImageToStorageWithNormalize', 'slow-path:normalize', { rawPath, outputPrefix });

  const { error: rawError } = await supabase.storage
    .from(BUCKET)
    .upload(rawPath, file, { contentType: file.type, upsert: false });

  if (rawError) {
    log.error('uploadImageToStorageWithNormalize', 'raw upload failed', { rawPath, error: rawError.message });
    throw rawError;
  }

  const result = await callNormalizeRatio({ rawPath, outputPrefix });

  if (!result.success || !result.data) {
    const msg = result.error ?? 'Normalize failed';
    log.error('uploadImageToStorageWithNormalize', 'normalize failed', { rawPath, error: msg });
    throw new Error(msg);
  }

  return {
    publicUrl: result.data.publicUrl,
    path: result.data.path,
    ratio: result.data.ratio,
  };
}
