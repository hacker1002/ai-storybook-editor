// style-api.ts — Supabase Storage + CRUD helpers for the art-style library.
// Storage path layout: art-styles/{styleId}/{uuid}.{ext} in public bucket 'storybook-assets'.
// `art_styles` table has no RLS — authenticated full CRUD via anon key + session.

import { supabase } from '@/apis/supabase';
import { extFromMime } from '@/apis/human-api';
import {
  MAX_STYLE_IMG_BYTES,
  STORAGE_BUCKET,
  STYLE_STORAGE_PREFIX,
} from '@/features/styles/constants/constants';
import type { ArtStyleRow, StyleImageReference } from '@/types/art-style';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'StyleApi');

// Tight allowlist (parity with human-api): reject SVG/avif/etc. into the public
// bucket — stored-XSS surface + odd extensions. Form input keeps accept="image/*";
// this API is the enforcement point.
const ALLOWED_STYLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const STYLE_PATH_PREFIX = (styleId: string) => `${STYLE_STORAGE_PREFIX}/${styleId}`;

function genUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip the extension from a filename → reference image title. */
function stripExt(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Derive the storage object path from a public URL (best-effort). */
function pathFromPublicUrl(mediaUrl: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const idx = mediaUrl.indexOf(marker);
  if (idx === -1) return null;
  const tail = mediaUrl.slice(idx + marker.length).split('?')[0];
  return tail ? decodeURIComponent(tail) : null;
}

/**
 * Upload one reference image for a style. Validates image MIME + 10MB cap.
 * Returns the StyleImageReference ({ title from filename, public URL }).
 */
export async function uploadStyleImage(
  styleId: string,
  file: File,
): Promise<StyleImageReference> {
  if (!ALLOWED_STYLE_IMAGE_TYPES.includes(file.type)) {
    log.warn('uploadStyleImage', 'rejected: type not allowed', {
      type: file.type,
      len: file.size,
    });
    throw new Error('Unsupported image type. Use JPG, PNG, or WebP.');
  }
  if (file.size > MAX_STYLE_IMG_BYTES) {
    throw new Error(
      `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${MAX_STYLE_IMG_BYTES / 1024 / 1024}MB`,
    );
  }

  const ext = extFromMime(file.type);
  const path = `${STYLE_PATH_PREFIX(styleId)}/${genUuid()}.${ext}`;

  log.info('uploadStyleImage', 'uploading', { styleId, path, size: file.size });

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    log.error('uploadStyleImage', 'failed', { styleId, path, error: error.message });
    throw error;
  }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  log.info('uploadStyleImage', 'done', { styleId, path: data.path });
  return { title: stripExt(file.name), mediaUrl: urlData.publicUrl };
}

/** Best-effort remove of a single reference image by its public URL. Swallows errors. */
export async function removeStyleImage(mediaUrl: string): Promise<void> {
  const path = pathFromPublicUrl(mediaUrl);
  if (!path) {
    log.warn('removeStyleImage', 'could not derive path from url');
    return;
  }
  log.info('removeStyleImage', 'start', { path });
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) {
    log.warn('removeStyleImage', 'remove failed', { path, error: error.message });
    return;
  }
  log.info('removeStyleImage', 'done', { path });
}

/**
 * Best-effort: list + remove all objects under art-styles/{styleId}/.
 * Returns true if cleared (or already empty); false on partial/total failure.
 * Always swallows errors and logs — caller proceeds with DB delete.
 */
export async function removeStyleStorageFolder(styleId: string): Promise<boolean> {
  log.info('removeStyleStorageFolder', 'start', { styleId });
  const prefix = STYLE_PATH_PREFIX(styleId);

  const { data: files, error: listError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000 });

  if (listError) {
    log.warn('removeStyleStorageFolder', 'list failed', { styleId, error: listError.message });
    return false;
  }

  if (!files || files.length === 0) {
    log.info('removeStyleStorageFolder', 'empty folder', { styleId });
    return true;
  }

  const paths = files.map((f) => `${prefix}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  if (removeError) {
    log.warn('removeStyleStorageFolder', 'remove failed', { styleId, count: paths.length, error: removeError.message });
    return false;
  }

  log.info('removeStyleStorageFolder', 'done', { styleId, count: paths.length });
  return true;
}

/** Insert a new art_styles row. Returns the inserted row or null on error. */
export async function insertStyle(row: Partial<ArtStyleRow>): Promise<ArtStyleRow | null> {
  log.info('insertStyle', 'start', { id: row.id });
  const { data, error } = await supabase
    .from('art_styles')
    .insert(row)
    .select('*')
    .single();

  if (error || !data) {
    log.error('insertStyle', 'failed', { id: row.id, error: error?.message });
    return null;
  }
  log.info('insertStyle', 'done', { id: (data as ArtStyleRow).id });
  return data as ArtStyleRow;
}

/** Update an existing art_styles row. Returns the updated row or null on error. */
export async function updateStyle(
  id: string,
  row: Partial<ArtStyleRow>,
): Promise<ArtStyleRow | null> {
  log.info('updateStyle', 'start', { id, fields: Object.keys(row) });
  const { data, error } = await supabase
    .from('art_styles')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    log.error('updateStyle', 'failed', { id, error: error?.message });
    return null;
  }
  log.info('updateStyle', 'done', { id });
  return data as ArtStyleRow;
}

/** Delete an art_styles row. Returns true on success. */
export async function deleteStyle(id: string): Promise<boolean> {
  log.info('deleteStyle', 'start', { id });
  const { error } = await supabase.from('art_styles').delete().eq('id', id);
  if (error) {
    log.error('deleteStyle', 'failed', { id, error: error.message });
    return false;
  }
  log.info('deleteStyle', 'done', { id });
  return true;
}

/**
 * Count books referencing this style via books.artstyle_id (delete-guard).
 * FK is ON DELETE SET NULL + nullable, so reassign is feasible.
 */
export async function countBooksUsingStyle(styleId: string): Promise<number> {
  log.info('countBooksUsingStyle', 'start', { styleId });
  const { count, error } = await supabase
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('artstyle_id', styleId);

  if (error) {
    log.error('countBooksUsingStyle', 'failed', { styleId, error: error.message });
    return 0;
  }
  log.info('countBooksUsingStyle', 'done', { styleId, count: count ?? 0 });
  return count ?? 0;
}
