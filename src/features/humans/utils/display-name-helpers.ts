// display-name-helpers.ts — Helpers for resolving display name / avatar / profile counts on humans.

import type { Human } from '@/types/human';

const DEFAULT_LOCALE = 'en_US';

/**
 * Build the persisted displayName JSONB block.
 * Strips empty entries; auto-seeds en_US from sourceName if missing.
 */
export function normalizeDisplayNames(
  raw: Record<string, string>,
  fallbackSourceName: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, value] of Object.entries(raw)) {
    const trimmed = (value ?? '').trim();
    if (trimmed.length > 0) out[code] = trimmed;
  }
  if (!out[DEFAULT_LOCALE]) {
    const fallback = fallbackSourceName.trim();
    if (fallback.length > 0) out[DEFAULT_LOCALE] = fallback;
  }
  return out;
}

/** Resolve display name for a given locale, falling back to en_US then sourceName. */
export function resolveDisplayName(human: Human, locale: string): string {
  const direct = human.displayName?.[locale];
  if (direct && direct.trim().length > 0) return direct;
  const en = human.displayName?.[DEFAULT_LOCALE];
  if (en && en.trim().length > 0) return en;
  return human.sourceName;
}

/**
 * Resolve avatar URL: prefer face profile with smallest age (rawImages[0]),
 * fallback to any visual profile with images. Returns null if none.
 */
export function resolveAvatarUrl(human: Human): string | null {
  const faces = human.visualProfiles
    .filter((p) => p.type === 'face' && p.rawImages.length > 0)
    .slice()
    .sort((a, b) => a.age - b.age);
  if (faces.length > 0) return faces[0].rawImages[0];

  const any = human.visualProfiles.find((p) => p.rawImages.length > 0);
  return any ? any.rawImages[0] : null;
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Format face count for row display, e.g. "2 faces". Uses em-dash for zero. */
export function formatFaceCount(human: Human): string {
  const v = human.visualProfiles.length;
  return v === 0 ? '— faces' : pluralize(v, 'face');
}
