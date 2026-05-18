// clone-builder.ts — Pure helpers that derive a Remix row payload from the
// active snapshot + user-driven RemixConfig. No side effects.

import type {
  BaseSpread,
  SpreadImage,
  SpreadVideo,
  SpreadAutoPic,
  SpreadAudio,
  SpreadAutoAudio,
  SpreadTag,
  Geometry,
} from '@/types/spread-types';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { IllustrationData } from '@/types/illustration-types';
import type {
  InsertableRemixRow,
  RemixCharacter,
  RemixConfig,
  RemixCropSheet,
  RemixIllustration,
  RemixMix,
  RemixProp,
  RemixSpread,
} from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'RemixCloneBuilder');

/** Max crops per sheet before splitting into an additional sheet. Heuristic per
 *  Validation Session 1 — keeps a single visual grid manageable (8×4). */
export const MAX_CROPS_PER_SHEET = 32;

export interface CloneBuilderInput {
  snapshotId: string;
  illustration: IllustrationData;
  characters: Character[];
  props: Prop[];
}

// ── Public helpers ───────────────────────────────────────────────────────────

/** Compose a human-readable mix name from key list, preserving order.
 *  Falls back to the key string when no entity name is found. */
export function composeMixName(
  keys: string[],
  characters: { key: string; name: string }[],
  props: { key: string; name: string }[],
): string {
  const lookup = new Map<string, string>();
  for (const c of characters) lookup.set(c.key, c.name);
  for (const p of props) lookup.set(p.key, p.name);
  return keys.map((k) => lookup.get(k) ?? k).join(' & ');
}

/** Drop editor-only fields from a snapshot spread. Layer IDs and the rest are
 *  preserved verbatim — animations[].target.id continues to resolve correctly. */
export function cloneIllustration(src: IllustrationData): RemixIllustration {
  return {
    sections: src.sections.map((s) => structuredClone(s)),
    spreads: src.spreads.map(stripSpread),
  };
}

function stripSpread(spread: BaseSpread): RemixSpread {
  const cloned = structuredClone(spread) as BaseSpread;
  delete cloned.raw_images;
  delete cloned.raw_textboxes;
  delete cloned.manuscript;
  delete cloned.tiny_sketch_media_url;
  return cloned as RemixSpread;
}

// ── Tag-bearing layer iteration ──────────────────────────────────────────────

type TaggedLayer = SpreadImage | SpreadVideo | SpreadAutoPic | SpreadAudio | SpreadAutoAudio;
type TaggedLayerKind = 'image' | 'video' | 'auto_pic' | 'audio' | 'auto_audio';

interface TaggedLayerVisit {
  layer: TaggedLayer;
  kind: TaggedLayerKind;
}

function* iterTaggedLayers(spread: RemixSpread): Generator<TaggedLayerVisit> {
  for (const layer of spread.images ?? []) yield { layer, kind: 'image' };
  for (const layer of spread.auto_pics ?? []) yield { layer, kind: 'auto_pic' };
  for (const layer of spread.videos ?? []) yield { layer, kind: 'video' };
  for (const layer of spread.audios ?? []) yield { layer, kind: 'audio' };
  for (const layer of spread.auto_audios ?? []) yield { layer, kind: 'auto_audio' };
}

// ── Crop sheet population ────────────────────────────────────────────────────

function spreadNumberOf(spread: RemixSpread): number {
  const raw = spread.pages?.[0]?.number;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function geometryOf(layer: TaggedLayer): { x: number; y: number; w: number; h: number } {
  const g = (layer as { geometry?: Geometry | { x: number; y: number } }).geometry;
  if (!g) return { x: 0, y: 0, w: 0, h: 0 };
  const full = g as Geometry;
  return {
    x: full.x ?? 0,
    y: full.y ?? 0,
    w: (full as Partial<Geometry>).w ?? 0,
    h: (full as Partial<Geometry>).h ?? 0,
  };
}

function appendCropWithChunking(
  sheets: RemixCropSheet[],
  entityName: string,
  crop: RemixCropSheet['crops'][number],
): void {
  let target = sheets[sheets.length - 1];
  if (!target || target.crops.length >= MAX_CROPS_PER_SHEET) {
    const idx = sheets.length + 1;
    target = {
      title: idx === 1 ? entityName : `${entityName} (${idx})`,
      image_url: '',
      swap_results: [],
      crops: [],
    };
    sheets.push(target);
  }
  target.crops.push(crop);
}

/** Walks illustration spreads, pushes single-subject crops into each entity's
 *  crop_sheets. Mutates `entities` in place. */
function buildSingleSubjectCropSheets(
  entities: { key: string; name: string; crop_sheets: RemixCropSheet[] }[],
  illustration: RemixIllustration,
  tagType: 'character' | 'prop',
): void {
  const byKey = new Map(entities.map((e) => [e.key, e]));

  for (const spread of illustration.spreads) {
    const spreadNumber = spreadNumberOf(spread);
    for (const { layer } of iterTaggedLayers(spread)) {
      const tags = layer.tags ?? [];
      if (tags.length !== 1) continue;
      const tag = tags[0];
      if (tag.type !== tagType) continue;

      const entity = byKey.get(tag.object_key);
      if (!entity) continue;

      const crop = {
        spread_number: spreadNumber,
        aspect_ratio: (layer as SpreadImage).aspect_ratio ?? '1:1',
        name: tag.variant_key ?? '',
        variant: tag.variant_key ?? '',
        media_url: (layer as { media_url?: string }).media_url ?? '',
        geometry: geometryOf(layer),
        'z-index': (layer as { 'z-index'?: number })['z-index'] ?? 0,
      };
      appendCropWithChunking(entity.crop_sheets, entity.name, crop);
    }
  }
}

function buildMixes(
  illustration: RemixIllustration,
  characters: { key: string; name: string }[],
  props: { key: string; name: string }[],
): RemixMix[] {
  const bySig = new Map<string, RemixMix>();
  let order = 0;

  for (const spread of illustration.spreads) {
    const spreadNumber = spreadNumberOf(spread);
    for (const { layer } of iterTaggedLayers(spread)) {
      const subjectTags: SpreadTag[] = (layer.tags ?? []).filter(
        (t) => t.type === 'character' || t.type === 'prop',
      );
      if (subjectTags.length <= 1) continue;

      const keys = subjectTags.map((t) => t.object_key);
      const sig = canonicalMixKey(keys);
      let mix = bySig.get(sig);
      if (!mix) {
        const mixName = composeMixName(keys, characters, props);
        mix = { order: order++, name: mixName, keys, crop_sheets: [] };
        bySig.set(sig, mix);
      }

      const crop = {
        spread_number: spreadNumber,
        aspect_ratio: (layer as SpreadImage).aspect_ratio ?? '1:1',
        name: subjectTags.map((t) => t.variant_key ?? '').join('+'),
        variant: subjectTags.map((t) => t.variant_key ?? '').join('+'),
        media_url: (layer as { media_url?: string }).media_url ?? '',
        geometry: geometryOf(layer),
        'z-index': (layer as { 'z-index'?: number })['z-index'] ?? 0,
      };
      appendCropWithChunking(mix.crop_sheets, mix.name, crop);
    }
  }
  return [...bySig.values()];
}

// ── Top-level orchestrator ───────────────────────────────────────────────────

export function buildRemixClonePayload(
  input: CloneBuilderInput,
  config: RemixConfig,
  name?: string,
): InsertableRemixRow {
  log.info('buildRemixClonePayload', 'start', {
    snapshotId: input.snapshotId,
    charCount: input.characters.length,
    propCount: input.props.length,
    spreadCount: input.illustration.spreads.length,
  });

  const enabledCharKeys = new Set(
    config.characters.filter((c) => c.is_enabled).map((c) => c.key),
  );
  const enabledPropKeys = new Set(
    config.props.filter((p) => p.is_enabled).map((p) => p.key),
  );

  const characters: RemixCharacter[] = input.characters
    .filter((c) => enabledCharKeys.has(c.key))
    .map((c) => {
      const cloned = structuredClone(c) as Character;
      // Replace base CropSheet[] with RemixCropSheet[] (initialized empty).
      const { crop_sheets: _unused, ...rest } = cloned;
      void _unused;
      return { ...rest, crop_sheets: [] as RemixCropSheet[] } as RemixCharacter;
    });

  const props: RemixProp[] = input.props
    .filter((p) => enabledPropKeys.has(p.key))
    .map((p) => {
      const cloned = structuredClone(p) as Prop;
      const { crop_sheets: _cs, sounds: _sounds, ...rest } = cloned;
      void _cs;
      void _sounds;
      return { ...rest, crop_sheets: [] as RemixCropSheet[] } as RemixProp;
    });

  const illustration = cloneIllustration(input.illustration);

  buildSingleSubjectCropSheets(characters, illustration, 'character');
  buildSingleSubjectCropSheets(props, illustration, 'prop');
  const mixes = buildMixes(illustration, characters, props);

  const sheetTotal =
    characters.reduce((a, c) => a + c.crop_sheets.length, 0) +
    props.reduce((a, p) => a + p.crop_sheets.length, 0) +
    mixes.reduce((a, m) => a + m.crop_sheets.length, 0);

  log.debug('buildRemixClonePayload', 'done', {
    characters: characters.length,
    props: props.length,
    mixes: mixes.length,
    sheetTotal,
  });

  return {
    snapshot_id: input.snapshotId,
    name: name?.trim() || 'Untitled Remix',
    remix_config: config,
    illustration,
    characters,
    props,
    mixes,
  };
}
