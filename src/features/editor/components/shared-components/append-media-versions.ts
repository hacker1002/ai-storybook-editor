// append-media-versions.ts — pure fold turning fresh extract-result URLs into new illustration
// versions on an existing version list (caller-owns-write). The Extract modal's onCreateImages
// yields already-uploaded permanent URLs (not a full Illustration[] like Edit does), so the sketch
// base/variant crop connectors must splice them onto the crop's current versions themselves.
//
// Semantics mirror addSketchSpreadImageVersion: new versions PREPEND, the first added becomes the
// selected head, every prior version is deselected. `type` is omitted (coerces to 'created') — an
// extract-crop is a fresh derived asset, not an in-place edit with a pre-edit original_url.

import type { Illustration } from '@/types/prop-types';

/** One added version: a permanent media URL + optional AI-usage provenance (soft ref →
 *  ai_service_logs.id). CV-only sources (crop) omit `ai_request_id`; AI sources carry it. */
export interface AppendMediaVersionEntry {
  media_url: string;
  ai_request_id?: string;
}

/** Prepend `entries` as new versions of `existing`; entries[0] = selected head, all others
 *  deselected. Each added entry carries its `ai_request_id` (omitted → NULL provenance). */
export function appendMediaVersions(
  existing: Illustration[],
  entries: AppendMediaVersionEntry[],
): Illustration[] {
  if (entries.length === 0) return existing;
  const now = new Date().toISOString();
  const added: Illustration[] = entries.map((entry, i) => ({
    media_url: entry.media_url,
    created_time: now,
    is_selected: i === 0,
    ...(entry.ai_request_id ? { ai_request_id: entry.ai_request_id } : {}),
  }));
  const deselected = existing.map((i) => (i.is_selected ? { ...i, is_selected: false } : i));
  return [...added, ...deselected];
}
