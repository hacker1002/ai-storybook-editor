// tag-utils.ts - Pure helpers for ItemTagsSection: dedup, options building, variant resolution

import type { SpreadTag, SpreadTagType, SpreadTagOtherKey } from '@/types/spread-types';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import { BASE_VARIANT_KEY, BASE_VARIANT_NAME } from '@/constants/variant-constants';

// === Internal types ===

export type TagGroupLabel = 'Characters' | 'Props' | 'Others';

export interface DraftTagRow {
  _draftId: string;
  type?: SpreadTagType;
  object_key?: string;
  variant_key?: string | null;
}

export interface ObjectOption {
  type: SpreadTagType;
  object_key: string;
  label: string;
  groupLabel: TagGroupLabel;
}

export interface VariantOption {
  key: string;
  name: string;
}

// Hardcoded options for the Others group — no entity backing, no variants.
export const OTHER_OPTIONS: { key: SpreadTagOtherKey; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'vfx', label: 'VFX' },
];

// === Helpers ===

/** First-occurrence-wins dedup by (type, object_key, variant_key) tuple.
 *  null variant_key (type='other') participates as the literal string "null" — same key collapses. */
export function dedupTags(tags: SpreadTag[]): SpreadTag[] {
  const seen = new Set<string>();
  const result: SpreadTag[] = [];
  for (const tag of tags) {
    const k = `${tag.type}|${tag.object_key}|${tag.variant_key ?? ''}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push(tag);
    }
  }
  return result;
}

/** Build grouped object options: Characters from store + Props from store + hardcoded Others. */
export function buildObjectOptions(
  characters: Character[],
  props: Prop[],
): ObjectOption[] {
  const opts: ObjectOption[] = [];
  for (const c of characters) {
    opts.push({ type: 'character', object_key: c.key, label: c.name, groupLabel: 'Characters' });
  }
  for (const p of props) {
    opts.push({ type: 'prop', object_key: p.key, label: p.name, groupLabel: 'Props' });
  }
  for (const o of OTHER_OPTIONS) {
    opts.push({ type: 'other', object_key: o.key, label: o.label, groupLabel: 'Others' });
  }
  return opts;
}

/**
 * Lookup entity variants by (type, objectKey).
 * Returns:
 *   - [] for type='other' (no variants by design — caller hides Variant dropdown)
 *   - [] for dangling character/prop refs (caller renders dangling fallback)
 *   - [{key: BASE_VARIANT_KEY, name: BASE_VARIANT_NAME}] when entity has empty variants[] (defensive fallback)
 */
export function resolveVariants(
  type: SpreadTagType,
  objectKey: string,
  characters: Character[],
  props: Prop[],
): VariantOption[] {
  if (type === 'other') return [];

  let entity: { variants: { key: string; name: string }[] } | undefined;
  if (type === 'character') entity = characters.find((c) => c.key === objectKey);
  else if (type === 'prop') entity = props.find((p) => p.key === objectKey);

  if (!entity) return [];

  const variants = entity.variants ?? [];
  if (variants.length === 0) return [{ key: BASE_VARIANT_KEY, name: BASE_VARIANT_NAME }];
  return variants.map((v) => ({ key: v.key, name: v.name }));
}

/** Return set of variant_key values already used for (type, objectKey), excluding exceptIndex.
 *  null variant_key (type='other') is excluded — Others rows have no variant concept. */
export function getTakenVariants(
  tags: SpreadTag[],
  type: SpreadTagType,
  objectKey: string,
  exceptIndex?: number,
): Set<string> {
  return new Set(
    tags
      .filter(
        (t, i) =>
          i !== exceptIndex &&
          t.type === type &&
          t.object_key === objectKey &&
          t.variant_key != null,
      )
      .map((t) => t.variant_key as string),
  );
}
