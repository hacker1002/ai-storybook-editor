// tag-utils.ts - Pure helpers for ItemTagsSection: dedup, options building, variant resolution

import type { SpreadTag, SpreadTagType } from '@/types/spread-types';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { Stage } from '@/types/stage-types';

// === Internal types ===

export interface DraftTagRow {
  _draftId: string;
  type?: SpreadTagType;
  object_key?: string;
  variant_key?: string;
}

export interface ObjectOption {
  type: SpreadTagType;
  object_key: string;
  label: string;
  groupLabel: 'Characters' | 'Props' | 'Stages';
}

export interface VariantOption {
  key: string;
  name: string;
}

// === Helpers ===

/** First-occurrence-wins dedup by (type, object_key, variant_key) tuple. */
export function dedupTags(tags: SpreadTag[]): SpreadTag[] {
  const seen = new Set<string>();
  const result: SpreadTag[] = [];
  for (const tag of tags) {
    const k = `${tag.type}|${tag.object_key}|${tag.variant_key}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push(tag);
    }
  }
  return result;
}

/** Build grouped object options list from all entity collections. */
export function buildObjectOptions(
  characters: Character[],
  props: Prop[],
  stages: Stage[],
): ObjectOption[] {
  const opts: ObjectOption[] = [];
  for (const c of characters) {
    opts.push({ type: 'character', object_key: c.key, label: c.name, groupLabel: 'Characters' });
  }
  for (const p of props) {
    opts.push({ type: 'prop', object_key: p.key, label: p.name, groupLabel: 'Props' });
  }
  for (const s of stages) {
    opts.push({ type: 'stage', object_key: s.key, label: s.name, groupLabel: 'Stages' });
  }
  return opts;
}

/**
 * Lookup entity variants by (type, objectKey).
 * Returns empty array for dangling references — caller handles warn logging + fallback UI.
 */
export function resolveVariants(
  type: SpreadTagType,
  objectKey: string,
  characters: Character[],
  props: Prop[],
  stages: Stage[],
): VariantOption[] {
  let entity: { variants: { key: string; name: string }[] } | undefined;
  if (type === 'character') entity = characters.find((c) => c.key === objectKey);
  else if (type === 'prop') entity = props.find((p) => p.key === objectKey);
  else entity = stages.find((s) => s.key === objectKey);

  if (!entity) return [];

  const variants = entity.variants ?? [];
  // Defensive: always include 'default' even if entity.variants is empty
  if (variants.length === 0) return [{ key: 'default', name: 'Default' }];
  return variants.map((v) => ({ key: v.key, name: v.name }));
}

/** Return set of variant_key values already used for (type, objectKey), excluding exceptIndex. */
export function getTakenVariants(
  tags: SpreadTag[],
  type: SpreadTagType,
  objectKey: string,
  exceptIndex?: number,
): Set<string> {
  return new Set(
    tags
      .filter((t, i) => i !== exceptIndex && t.type === type && t.object_key === objectKey)
      .map((t) => t.variant_key),
  );
}
