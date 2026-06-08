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
  RemixIllustration,
  RemixMix,
  RemixProp,
  RemixSpread,
} from '@/types/remix';
import { createLogger } from '@/utils/logger';
import { newUuid } from '@/utils/uuid';

const log = createLogger('Store', 'RemixCloneBuilder');

export interface CloneBuilderInput {
  snapshotId: string;
  illustration: IllustrationData;
  characters: Character[];
  props: Prop[];
}

// ── Public helpers ───────────────────────────────────────────────────────────

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

/** Subject tags only — `character` / `prop`. Role tags (`other`, e.g. stage /
 *  background) are excluded so they cannot affect single-vs-mix classification. */
export function subjectTagsOf(layer: TaggedLayer): SpreadTag[] {
  return (layer.tags ?? []).filter((t) => t.type === 'character' || t.type === 'prop');
}

/** Builds the single empty batch skeleton (rev2). `crop_sheets[]` is filled by
 *  `computeCropSheets` (layout engine over `groupCropsForBatch`) right after, in
 *  the same INSERT path. Identity = uuid; legacy `keys[]` lineup is gone. */
export function makeBatchSkeleton(order: number, name: string): RemixMix {
  return { id: newUuid(), order, name, crop_sheets: [] };
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
      // rev2: crops live on the batch (mixes[]), not on the entity.
      const remixChar = { ...cloned } as RemixCharacter;

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
      const { sounds: _sounds, ...rest } = cloned;
      void _sounds;
      // rev2: crops live on the batch (mixes[]), not on the entity.
      return { ...rest } as RemixProp;
    });

  const illustration = cloneIllustration(input.illustration);

  // rev2: a single empty batch skeleton. `computeCropSheets` fills its
  // `crop_sheets[]` from `groupCropsForBatch` + the layout engine in the same
  // INSERT path. No more single-subject/mix enumeration.
  const mixes: RemixMix[] = [makeBatchSkeleton(0, 'Batch 1')];

  log.debug('buildRemixClonePayload', 'done', {
    characters: characters.length,
    props: props.length,
    batchCount: mixes.length,
  });

  return {
    snapshot_id: input.snapshotId,
    name: name?.trim() || 'New Remix',
    remix_config: config,
    illustration,
    characters,
    props,
    mixes,
    // Lazy-init on first export/toggle (job handler or client). Null = reader
    // coalesces to DEFAULT — no need to materialize the full shape at create.
    distribution: null,
  };
}
