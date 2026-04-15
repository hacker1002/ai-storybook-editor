// storage-api.ts - Upload files to Supabase Storage (storybook-assets bucket)

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

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
}

async function uploadToStorage(
  file: File,
  allowedTypes: string[],
  maxSize: number,
  pathPrefix: string,
  fnName: string,
): Promise<UploadResult> {
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`);
  }
  if (file.size > maxSize) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${maxSize / 1024 / 1024}MB`);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${pathPrefix}/${Date.now()}-${sanitizedName}`;

  log.info(fnName, 'uploading', { path: filePath, size: file.size, type: file.type });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
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
  return uploadToStorage(file, ANIMATED_PIC_TYPES, ANIMATED_PIC_MAX_SIZE, pathPrefix, 'uploadAnimatedPicToStorage');
}
