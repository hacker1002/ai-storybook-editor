// style-mapper.ts — Row ↔ Domain mapping for art_styles.
// snake_case DB ↔ camelCase domain; null → '' / [].

import type { ArtStyle, ArtStyleRow } from '@/types/art-style';

/** Map a raw Supabase `art_styles` row → domain ArtStyle. */
export function mapStyleRow(row: ArtStyleRow): ArtStyle {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags ?? '',
    description: row.description ?? '',
    imageReferences: (row.image_references ?? []).map((ref) => ({
      title: ref.title,
      mediaUrl: ref.media_url,
    })),
    createdAt: row.created_at,
    type: row.type ?? 1, // fallback illustration — defensive vs pre-migration rows
  };
}

/**
 * Map a domain ArtStyle (partial) → Supabase row shape for insert/update.
 * Only includes provided fields; `tags` stays raw TEXT.
 */
export function toStyleRow(
  style: Partial<ArtStyle> & { id?: string },
): Partial<ArtStyleRow> {
  const row: Partial<ArtStyleRow> = {};
  if (style.id !== undefined) row.id = style.id;
  if (style.name !== undefined) row.name = style.name;
  if (style.tags !== undefined) row.tags = style.tags;
  if (style.description !== undefined) row.description = style.description;
  if (style.type !== undefined) row.type = style.type;
  if (style.imageReferences !== undefined) {
    row.image_references = style.imageReferences.map((ref) => ({
      title: ref.title,
      media_url: ref.mediaUrl,
    }));
  }
  return row;
}
