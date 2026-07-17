// append-media-versions.ts — pure fold turning fresh extract-result URLs into new illustration
// versions on an existing version list (caller-owns-write). The Extract modal's onCreateImages
// yields already-uploaded permanent URLs (not a full Illustration[] like Edit does), so the sketch
// base/variant crop connectors must splice them onto the crop's current versions themselves.
//
// Semantics mirror addSketchSpreadImageVersion: new versions PREPEND, the first added becomes the
// selected head, every prior version is deselected. `type` is omitted (coerces to 'created') — an
// extract-crop is a fresh derived asset, not an in-place edit with a pre-edit original_url.

import type { Illustration } from '@/types/prop-types';

/** Prepend `urls` as new versions of `existing`; urls[0] = selected head, all others deselected. */
export function appendMediaVersions(existing: Illustration[], urls: string[]): Illustration[] {
  if (urls.length === 0) return existing;
  const now = new Date().toISOString();
  const added: Illustration[] = urls.map((media_url, i) => ({
    media_url,
    created_time: now,
    is_selected: i === 0,
  }));
  const deselected = existing.map((i) => (i.is_selected ? { ...i, is_selected: false } : i));
  return [...added, ...deselected];
}
