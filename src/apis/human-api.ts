// human-api.ts — Supabase Storage helpers for human visual/voice profile uploads.
// Path layout: humans/{humanId}/{uuid}.{ext} in bucket 'storybook-assets'.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'HumanApi');

const BUCKET = 'storybook-assets';
const HUMAN_PATH_PREFIX = (id: string) => `humans/${id}`;

const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const AUDIO_MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
];

export interface UploadHumanAssetResult {
  publicUrl: string;
  path: string;
}

function genUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Map MIME → file extension (image + audio). Fallback to last token of MIME. */
export function extFromMime(mime: string): string {
  const lower = mime.toLowerCase();
  switch (lower) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/webm':
      return 'webm';
    default: {
      const tail = lower.split('/').pop() ?? 'bin';
      return tail.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
    }
  }
}

export async function uploadHumanImage(
  humanId: string,
  file: File,
): Promise<UploadHumanAssetResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
  }
  if (file.size > IMAGE_MAX_SIZE) {
    throw new Error(
      `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${IMAGE_MAX_SIZE / 1024 / 1024}MB`,
    );
  }

  const ext = extFromMime(file.type);
  const path = `${HUMAN_PATH_PREFIX(humanId)}/${genUuid()}.${ext}`;

  log.info('uploadHumanImage', 'uploading', { humanId, path, size: file.size });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    log.error('uploadHumanImage', 'failed', { humanId, path, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  log.info('uploadHumanImage', 'done', { humanId, publicUrl: urlData.publicUrl });
  return { publicUrl: urlData.publicUrl, path: data.path };
}

export async function uploadHumanAudio(
  humanId: string,
  blob: Blob,
  mimeType?: string,
): Promise<UploadHumanAssetResult> {
  const effectiveMime = mimeType ?? blob.type ?? 'application/octet-stream';
  if (!ALLOWED_AUDIO_TYPES.includes(effectiveMime)) {
    log.warn('uploadHumanAudio', 'mime not in allowlist but proceeding', { effectiveMime });
  }
  if (blob.size > AUDIO_MAX_SIZE) {
    throw new Error(
      `Audio too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB. Max ${AUDIO_MAX_SIZE / 1024 / 1024}MB`,
    );
  }

  const ext = extFromMime(effectiveMime);
  const path = `${HUMAN_PATH_PREFIX(humanId)}/${genUuid()}.${ext}`;

  log.info('uploadHumanAudio', 'uploading', { humanId, path, size: blob.size, mime: effectiveMime });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: effectiveMime, upsert: false });

  if (error) {
    log.error('uploadHumanAudio', 'failed', { humanId, path, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  log.info('uploadHumanAudio', 'done', { humanId, publicUrl: urlData.publicUrl });
  return { publicUrl: urlData.publicUrl, path: data.path };
}

/**
 * Best-effort: list + remove all objects under humans/{id}/.
 * Returns true if folder cleared (or already empty); false on partial/total failure.
 * Always swallows errors and logs — caller proceeds with DB delete.
 */
export async function removeHumanStorageFolder(humanId: string): Promise<boolean> {
  log.info('removeHumanStorageFolder', 'start', { humanId });
  const prefix = HUMAN_PATH_PREFIX(humanId);

  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });

  if (listError) {
    log.warn('removeHumanStorageFolder', 'list failed', { humanId, error: listError.message });
    return false;
  }

  if (!files || files.length === 0) {
    log.info('removeHumanStorageFolder', 'empty folder', { humanId });
    return true;
  }

  const paths = files.map((f) => `${prefix}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);

  if (removeError) {
    log.warn('removeHumanStorageFolder', 'remove failed', { humanId, count: paths.length, error: removeError.message });
    return false;
  }

  log.info('removeHumanStorageFolder', 'done', { humanId, count: paths.length });
  return true;
}

/** Bulk remove specific objects (compensation cleanup). Swallows errors. */
export async function removeHumanStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  log.info('removeHumanStorageObjects', 'start', { count: paths.length });
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    log.warn('removeHumanStorageObjects', 'failed', { count: paths.length, error: error.message });
    return;
  }
  log.info('removeHumanStorageObjects', 'done', { count: paths.length });
}
