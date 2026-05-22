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

export interface CloneBuilderInput {
  snapshotId: string;
  illustration: IllustrationData;
  characters: Character[];
  props: Prop[];
}

// ── Public helpers ───────────────────────────────────────────────────────────

/** A mix lineup token: `${objectKey}/${variantKey}`, or bare `${objectKey}`
 *  when the entity has no variant. Split on the FIRST `/` — object/variant keys
 *  are slugs that never contain `/`. */
const MIX_TOKEN_SEP = '/';

export function parseMixToken(token: string): { key: string; variantKey: string } {
  const i = token.indexOf(MIX_TOKEN_SEP);
  return i === -1
    ? { key: token, variantKey: '' }
    : { key: token.slice(0, i), variantKey: token.slice(i + 1) };
}

export function makeMixToken(key: string, variantKey: string): string {
  return variantKey ? `${key}${MIX_TOKEN_SEP}${variantKey}` : key;
}

/** Compose a human-readable mix name from a variant-qualified lineup, in lineup
 *  order. The variant name is shown in parens only when the entity has >1
 *  variant — so single-variant casts read cleanly ("Elara & Magic Sword") while
 *  multi-variant lineups disambiguate ("Elara (happy) & ..." vs "Elara (sad) & ..."). */
export function composeMixName(
  lineup: string[],
  entities: { key: string; name: string; variants?: { key: string; name?: string }[] }[],
): string {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  return lineup
    .map((token) => {
      const { key, variantKey } = parseMixToken(token);
      const entity = byKey.get(key);
      if (!entity) return key;
      const variants = entity.variants ?? [];
      if (variantKey && variants.length > 1) {
        const vName = variants.find((v) => v.key === variantKey)?.name ?? variantKey;
        return `${entity.name} (${vName})`;
      }
      return entity.name;
    })
    .join(' & ');
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

export type TaggedLayer =
  | SpreadImage
  | SpreadVideo
  | SpreadAutoPic
  | SpreadAudio
  | SpreadAutoAudio;
type TaggedLayerKind = 'image' | 'video' | 'auto_pic' | 'audio' | 'auto_audio';

export interface TaggedLayerVisit {
  layer: TaggedLayer;
  kind: TaggedLayerKind;
}

export function* iterTaggedLayers(spread: RemixSpread): Generator<TaggedLayerVisit> {
  for (const layer of spread.images ?? []) yield { layer, kind: 'image' };
  for (const layer of spread.auto_pics ?? []) yield { layer, kind: 'auto_pic' };
  for (const layer of spread.videos ?? []) yield { layer, kind: 'video' };
  for (const layer of spread.audios ?? []) yield { layer, kind: 'audio' };
  for (const layer of spread.auto_audios ?? []) yield { layer, kind: 'auto_audio' };
}

// ── Crop sheet population ────────────────────────────────────────────────────

export function spreadNumberOf(spread: RemixSpread): number {
  const raw = spread.pages?.[0]?.number;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function geometryOf(layer: TaggedLayer): { x: number; y: number; w: number; h: number } {
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

/** A blank crop sheet for a config-enabled entity. Every character/prop key
 *  carries exactly one sheet, even when no layer tags it (0 crops). Title is
 *  the canonical default `sheet 1` — entity name is rendered separately in the
 *  sidebar header (see `crop-sheet-entity-sidebar.tsx`). */
function makeDefaultSheet(): RemixCropSheet {
  return {
    title: 'sheet 1',
    sheet_geometry: { width: 0, height: 0 },
    image_url: '',
    swap_results: [],
    crops: [],
    // Phase 01 placeholder: clone-builder defaults to null. Phase 02 wires the
    // variant_key during initial sheet construction once the engine ships.
    variant_key: null,
  };
}

/** Subject tags only — `character` / `prop`. Role tags (`other`, e.g. stage /
 *  background) are excluded so they cannot affect single-vs-mix classification. */
export function subjectTagsOf(layer: TaggedLayer): SpreadTag[] {
  return (layer.tags ?? []).filter((t) => t.type === 'character' || t.type === 'prop');
}

/** Walks illustration spreads, pushes single-subject crops into each entity's
 *  single crop sheet (`crop_sheets[0]`). Mutates `entities` in place.
 *  Classification uses subject-tag count only: a layer counts as a single-subject
 *  crop iff it has exactly one `character`/`prop` tag matching `tagType`. */
function populateSingleSubjectCrops(
  entities: { key: string; name: string; crop_sheets: RemixCropSheet[] }[],
  illustration: RemixIllustration,
  tagType: 'character' | 'prop',
): void {
  const byKey = new Map(entities.map((e) => [e.key, e]));

  for (const spread of illustration.spreads) {
    const spreadNumber = spreadNumberOf(spread);
    for (const { layer, kind } of iterTaggedLayers(spread)) {
      // Crop sheets carry static-image crops only — skip auto_pic/video/audio.
      if (kind !== 'image') continue;
      const subjectTags = subjectTagsOf(layer);
      if (subjectTags.length !== 1) continue;
      const tag = subjectTags[0];
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
      // Single sheet per key — created up-front in buildRemixClonePayload.
      entity.crop_sheets[0].crops.push(crop);
    }
  }
}

type MixVariant = { key: string; name?: string; type?: number };
type MixEntity = {
  key: string;
  name: string;
  variants?: MixVariant[];
  crop_sheets: RemixCropSheet[];
};

/** Base variant of an entity (`type === 0`), else the first declared variant,
 *  else `''`. Used to fill entities absent from a crop when canonicalizing its
 *  mix lineup — the dedup tie-break (a co-occurrence with no explicit variant
 *  for entity E lands in E's base-variant lineup). */
export function baseVariantKey(entity: {
  variants?: { key: string; type?: number }[];
}): string {
  const variants = entity.variants ?? [];
  return (variants.find((v) => v.type === 0) ?? variants[0])?.key ?? '';
}

/** Full enabled-cast member for mix lineup math: entity key + its base variant. */
export interface MixCastMember {
  key: string;
  baseVariant: string;
}

/** Canonical full-cast variant lineup for a set of enabled subject tags. Each
 *  cast member contributes the variant it carries in THIS crop, or its base
 *  variant when absent. Shared by clone-builder (mix enumeration) and
 *  crop-grouping (mix crop membership) so both agree on a mix's identity —
 *  `canonicalMixKey(mixLineupTokens(...))`. */
export function mixLineupTokens(
  enabledTags: { object_key: string; variant_key?: string | null }[],
  cast: MixCastMember[],
): string[] {
  const baseByKey = new Map(cast.map((c) => [c.key, c.baseVariant]));
  const cropVariantByKey = new Map<string, string>();
  for (const t of enabledTags) {
    cropVariantByKey.set(t.object_key, t.variant_key || (baseByKey.get(t.object_key) ?? ''));
  }
  return cast.map((c) => makeMixToken(c.key, cropVariantByKey.get(c.key) ?? c.baseVariant));
}

function makeMixCrop(layer: TaggedLayer, spreadNumber: number, variant: string) {
  return {
    spread_number: spreadNumber,
    aspect_ratio: (layer as SpreadImage).aspect_ratio ?? '1:1',
    name: variant,
    variant,
    media_url: (layer as { media_url?: string }).media_url ?? '',
    geometry: geometryOf(layer),
    'z-index': (layer as { 'z-index'?: number })['z-index'] ?? 0,
  };
}

/**
 * Mixes = co-occurrence swap groups, keyed on a **variant lineup** of the full
 * enabled cast (not just the object keys present in a crop). Each multi-subject
 * image crop is assigned to exactly one group:
 *
 *   - Drop disabled subjects from the layer, then classify by enabled count:
 *       0 → no swappable subject, skip
 *       1 → effectively single-subject, fold into that entity's crop sheet
 *       ≥2 → genuine mix
 *   - For a mix, build the lineup over the WHOLE enabled cast: each entity
 *     contributes the variant tagged in this crop, or its base variant when
 *     absent. This canonical fill is what dedups the example:
 *       (A1,B1), (A1,C1), (B1,C1), (B1,C1,D) → all canonicalize to {A1,B1,C1,D}
 *       (A2,C1), (A2,D)                       → {A2,B1,C1,D}  (A pinned to A2)
 *     so a crop never lands in two groups, and the swap can reference the full
 *     cast (the AI ignores cast members absent from a given crop).
 */
function buildMixes(
  illustration: RemixIllustration,
  characters: MixEntity[],
  props: MixEntity[],
  enabledKeys: Set<string>,
): RemixMix[] {
  const bySig = new Map<string, RemixMix>();
  let order = 0;

  // Full enabled cast (characters first, then props) — deterministic lineup order.
  const castEntities: MixEntity[] = [...characters, ...props];
  const entityByKey = new Map(castEntities.map((e) => [e.key, e]));
  const cast: MixCastMember[] = castEntities.map((e) => ({
    key: e.key,
    baseVariant: baseVariantKey(e),
  }));

  for (const spread of illustration.spreads) {
    const spreadNumber = spreadNumberOf(spread);
    for (const { layer, kind } of iterTaggedLayers(spread)) {
      // Mixes are derived from image crops only — a co-occurrence that exists
      // solely in an auto_pic/video/audio layer yields no swappable crop.
      if (kind !== 'image') continue;
      const subjectTags = subjectTagsOf(layer);
      if (subjectTags.length <= 1) continue;

      const enabledTags = subjectTags.filter((t) => enabledKeys.has(t.object_key));
      if (enabledTags.length === 0) continue;

      if (enabledTags.length === 1) {
        const tag = enabledTags[0];
        const entity = entityByKey.get(tag.object_key);
        if (!entity) continue;
        entity.crop_sheets[0].crops.push(
          makeMixCrop(layer, spreadNumber, tag.variant_key ?? ''),
        );
        continue;
      }

      // ≥2 enabled subjects → genuine mix. Identity = canonical full-cast
      // variant lineup (shared with crop-grouping so membership agrees).
      const lineup = mixLineupTokens(enabledTags, cast);
      const sig = canonicalMixKey(lineup);
      let mix = bySig.get(sig);
      if (!mix) {
        // Each mix carries exactly one crop sheet.
        mix = {
          order: order++,
          name: composeMixName(lineup, castEntities),
          keys: lineup,
          crop_sheets: [makeDefaultSheet()],
        };
        bySig.set(sig, mix);
      }

      const variant = enabledTags.map((t) => t.variant_key ?? '').join('+');
      mix.crop_sheets[0].crops.push(makeMixCrop(layer, spreadNumber, variant));
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
      // Replace base CropSheet[] with exactly one blank RemixCropSheet.
      const { crop_sheets: _unused, ...rest } = cloned;
      void _unused;
      const remixChar = { ...rest, crop_sheets: [makeDefaultSheet()] } as RemixCharacter;

      // Live-swap result: copy config.characters[].base_image_url onto the base
      // variant (type=0) as `visual_swap_url` (Option A — Validation S1b). The
      // config field is modal staging; the variant field is the persisted
      // per-variant swap visual. Downstream (Phase 3 crop-sheet inject) reads
      // `visual_swap_url` when present, else the original base sheet.
      const cfg = config.characters.find((x) => x.key === c.key);
      if (cfg?.base_image_url) {
        const base = remixChar.variants.find((v) => v.type === 0);
        if (base) base.visual_swap_url = cfg.base_image_url;
      }
      return remixChar;
    });

  const props: RemixProp[] = input.props
    .filter((p) => enabledPropKeys.has(p.key))
    .map((p) => {
      const cloned = structuredClone(p) as Prop;
      const { crop_sheets: _cs, sounds: _sounds, ...rest } = cloned;
      void _cs;
      void _sounds;
      return { ...rest, crop_sheets: [makeDefaultSheet()] } as RemixProp;
    });

  const illustration = cloneIllustration(input.illustration);

  populateSingleSubjectCrops(characters, illustration, 'character');
  populateSingleSubjectCrops(props, illustration, 'prop');
  const mixes = buildMixes(illustration, characters, props, new Set([
    ...enabledCharKeys,
    ...enabledPropKeys,
  ]));

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
    name: name?.trim() || 'New Remix',
    remix_config: config,
    illustration,
    characters,
    props,
    mixes,
  };
}
