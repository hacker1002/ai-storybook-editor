// build-snapshot-from-parsed.ts — Intermediate parse model → typed SKETCH snapshot
// (design 07-01 §3/§4). Pure & strongly typed; no DB. Builds the full top-level entity
// catalog (characters/props/stages) + a sketch projection of it, and delegates spread
// building to the SHARED new-template parser (`sketch-spread-excel.ts`).
//
// Illustration raw layers / Flow ordering / branch_setting / sections / script docs were
// removed — sketch carries none of those.

import { newUuid } from '@/utils/uuid';
import { createLogger } from '@/utils/logger';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { Stage } from '@/types/stage-types';
import type { Sketch, SketchEntity } from '@/types/sketch';
import type { ParsedEntityRow, ImportModalMeta } from './import-script-types';
import type { ImportedWorkbook } from './parse-excel-workbook';
import { buildSketchSpreadsFromWorkbook } from './sketch-spread-excel';
import type { ImportIssues, SketchImportBook } from './sketch-spread-excel.types';

const log = createLogger('Books', 'BuildSnapshot');

/** book.step for an imported sketch book (design 07-01 §7; was 2 = illustration). */
export const BOOK_STEP_SKETCH = 1;

/** Final assembled sketch snapshot payload (subset written by createImportedBook). */
export interface ImportedSketchSnapshot {
  sketch: Sketch;
  characters: Character[];
  props: Prop[];
  stages: Stage[];
}

// ── String helpers ────────────────────────────────────────────────────────────

/** 'house_night' → 'House Night'. */
export function titlecase(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Entity mappers ────────────────────────────────────────────────────────────

const emptyAppearance = () => ({ height: 0, hair: '', eyes: '', face: '', build: '' });
const emptyBasicInfo = () => ({ description: '', gender: '', age: '', category_id: '', role: '' });
const emptyPersonality = () => ({
  core_essence: '',
  flaws: '',
  emotions: '',
  reactions: '',
  desires: '',
  likes: '',
  fears: '',
  contradictions: '',
});
const emptyTemporal = () => ({ era: '', season: '', weather: '', time_of_day: '' });
const emptySensory = () => ({ atmosphere: '', soundscape: '', lighting: '', color_palette: '' });
const emptyEmotional = () => ({ mood: '' });

const variantType = (variantKey: string): 0 | 1 => (variantKey === 'base' ? 0 : 1);

/** Group rows by entity key, preserving first-appearance order. */
function groupByKey(rows: ParsedEntityRow[]): Map<string, ParsedEntityRow[]> {
  const groups = new Map<string, ParsedEntityRow[]>();
  for (const row of rows) {
    if (!groups.has(row.key)) groups.set(row.key, []);
    groups.get(row.key)!.push(row);
  }
  return groups;
}

export function buildCharacters(rows: ParsedEntityRow[]): Character[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    basic_info: emptyBasicInfo(),
    personality: emptyPersonality(),
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      appearance: emptyAppearance(),
      visual_description: row.description,
      illustrations: [],
      image_references: [],
    })),
    voice_setting: null,
  }));
}

export function buildProps(rows: ParsedEntityRow[]): Prop[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    category_id: '',
    type: 'narrative' as const,
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      visual_description: row.description,
      illustrations: [],
      image_references: [],
    })),
    sounds: [],
  }));
}

export function buildStages(rows: ParsedEntityRow[]): Stage[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    location_id: '',
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      visual_description: row.description,
      temporal: emptyTemporal(),
      sensory: emptySensory(),
      emotional: emptyEmotional(),
      illustrations: [],
      image_references: [],
    })),
    sounds: [],
  }));
}

// ── Sketch entity projection ────────────────────────────────────────────────────

/** Full entity catalog → thin sketch projection (design 07-01 §4.3): key + variant
 *  { key, visual_description }, image sheet empty (media_url: null). DRY — derived from
 *  the same full entities, never re-parsed. */
export function projectSketchEntities(
  entities: { key: string; variants: { key: string; visual_description: string }[] }[],
): SketchEntity[] {
  return entities.map((e) => ({
    key: e.key,
    media_url: null,
    variants: e.variants.map((v) => ({ key: v.key, visual_description: v.visual_description })),
  }));
}

// ── Assemble ──────────────────────────────────────────────────────────────────

/**
 * Compose the sketch snapshot: shared spread parser (spreads) + full entity catalog +
 * sketch projection. Book import carries no per-language typography (modal collects none)
 * → the shared parser falls back to defaults for textbox color/font. Returns the snapshot
 * plus the spread-parse issues (surfaced by validation before any write).
 */
export function assembleSketchSnapshot(
  parsed: ImportedWorkbook,
  meta: ImportModalMeta,
): { snapshot: ImportedSketchSnapshot; issues: ImportIssues } {
  const book: SketchImportBook = { original_language: meta.original_language, typography: null };
  const { spreads, issues } = buildSketchSpreadsFromWorkbook(parsed.spreadsSource, book);

  const characters = buildCharacters(parsed.characters);
  const props = buildProps(parsed.props);
  const stages = buildStages(parsed.stages);

  const sketch: Sketch = {
    id: newUuid(),
    characters: projectSketchEntities(characters),
    props: projectSketchEntities(props),
    stages: projectSketchEntities(stages),
    spreads,
  };

  log.info('assembleSketchSnapshot', 'done', {
    spreadCount: spreads.length,
    characterCount: characters.length,
    propCount: props.length,
    stageCount: stages.length,
    warningCount: issues.warnings.length,
    errorCount: issues.errors.length,
  });

  return { snapshot: { sketch, characters, props, stages }, issues };
}
