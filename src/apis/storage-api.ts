// storage-api.ts - Upload files to Supabase Storage (storybook-assets bucket)

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'Storage');

const BUCKET = 'storybook-assets';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export interface UploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Upload a file to storybook-assets bucket and return the public URL.
 * Path: {prefix}/{timestamp}-{sanitized-filename}
 */
export async function uploadImageToStorage(
  file: File,
  pathPrefix = 'uploads',
): Promise<UploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${pathPrefix}/${Date.now()}-${sanitizedName}`;

  log.info('uploadImageToStorage', 'uploading', { path: filePath, size: file.size, type: file.type });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    log.error('uploadImageToStorage', 'upload failed', { path: filePath, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  log.info('uploadImageToStorage', 'upload complete', { publicUrl: urlData.publicUrl });

  return {
    publicUrl: urlData.publicUrl,
    path: data.path,
  };
}
