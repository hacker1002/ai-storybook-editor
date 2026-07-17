// sketch-coerce-helpers.ts — ELEMENT-level coercers for the sketch read boundary (ADR-047).
// One raw element (variant / crop / entity / style) → its typed shape, defaults filled. Split out
// of sketch-normalize.ts (500-line rule): this module owns the per-element rules, the normalizer
// owns the per-RESOURCE orchestration (fault isolation, placeholders, quarantine classification).
//
// Taxonomy (single source: sketch-resource-registry.ts): everything here is ABSENT-default or
// lossless CONVERT — except a non-object element / wrong-typed `variants`, which is a LOSSY reset
// and is reported when the caller passes a reporter + kind.

import type {
  SketchEntity,
  SketchVariant,
  SketchVariantCrop,
  SketchBaseStyle,
} from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';
import { createLogger } from '@/utils/logger';
import { parseHeightCm } from '@/utils/parse-height-cm';
import {
  describeResource,
  noopAnomalyReporter,
  type SketchAnomalyReporter,
  type SketchResourceKey,
} from './sketch-resource-registry';

const log = createLogger('Store', 'SketchCoerce');

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const typeNameOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

export const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The three entity collections under `sketch` — the only sub-trees that carry variants. */
export type SketchEntityCollection = 'characters' | 'props' | 'stages';
export const ENTITY_KINDS: readonly string[] = [
  'characters',
  'props',
  'stages',
] satisfies SketchEntityCollection[];

/** Resource key for one entity: node-grain when the key is readable, else the coarse collection. */
export function entityResourceKey(kind: SketchEntityCollection, key: string): SketchResourceKey {
  return key ? (`${kind}/${key}` as SketchResourceKey) : kind;
}

/** Coerce one raw variant-crop blob → SketchVariantCrop (positional cell; is_selected defaults
 *  to false, illustrations to []). */
export function coerceVariantCrop(raw: unknown): SketchVariantCrop {
  const r = isPlainObject(raw) ? raw : {};
  return {
    is_selected: Boolean(r.is_selected),
    illustrations: Array.isArray(r.illustrations) ? (r.illustrations as Illustration[]) : [],
  };
}

/** Coerce one raw variant → SketchVariant, filling the 3 required text fields when absent
 *  (backward-compat for blobs written before the 2026-07-13 restructure). raw_sheet parses the
 *  new `{ illustrations[], crops[] }` model; the legacy single `crop` blob (pre-2026-07-14) is
 *  mapped LOSSLESSLY into `crops[0]` (is_selected=true). Stage `illustrations[]` copied through
 *  when present. */
export function coerceVariant(raw: unknown): SketchVariant {
  const r = isPlainObject(raw) ? raw : {};
  const v: SketchVariant = {
    key: asStr(r.key),
    description: asStr(r.description),
    visual_design: asStr(r.visual_design),
    art_language: asStr(r.art_language),
  };
  // MIGRATE (read-time, 2026-07-17): height went string → number|null (cm). Every load/merge runs
  // through here, so a legacy string blob ("~110cm") self-parses to 110; an already-number value is
  // idempotent; an unparseable one becomes null (the variant itself is never dropped). No DB
  // migration needed. Presence-gated: a variant with NO height field keeps none (stage variants have
  // no height at all — writing `height: null` onto every one of them would churn the blob).
  if ('height' in r) {
    const parsed = parseHeightCm(r.height);
    // D1 (consent plan): unparseable height is an accepted lossless-by-decision CONVERT, but the
    // original string IS dropped on the next save — never let that happen silently.
    if (r.height != null && parsed === null) {
      log.warn('coerceVariant', 'height unparseable — replaced with null (original dropped on next save)', {
        variantKey: v.key,
        preview: String(r.height).slice(0, 40),
      });
    }
    v.height = parsed;
  }
  // Legacy single-cell crop (pre-2026-07-14) → mapped into crops[0] below.
  const legacyCropIllustrations =
    isPlainObject(r.crop) && Array.isArray(r.crop.illustrations)
      ? (r.crop.illustrations as Illustration[])
      : null;
  if (isPlainObject(r.raw_sheet)) {
    const illustrations = Array.isArray(r.raw_sheet.illustrations)
      ? (r.raw_sheet.illustrations as Illustration[])
      : [];
    let crops: SketchVariantCrop[];
    if (Array.isArray(r.raw_sheet.crops)) {
      crops = r.raw_sheet.crops.map(coerceVariantCrop); // new positional model
    } else if (legacyCropIllustrations) {
      crops = [{ is_selected: true, illustrations: legacyCropIllustrations }]; // BACK-COMPAT
    } else {
      crops = [];
    }
    v.raw_sheet = { illustrations, crops };
  } else if (legacyCropIllustrations) {
    // Legacy blob carrying only `crop` (no raw_sheet).
    v.raw_sheet = { illustrations: [], crops: [{ is_selected: true, illustrations: legacyCropIllustrations }] };
  }
  if (Array.isArray(r.illustrations)) v.illustrations = r.illustrations as Illustration[]; // stage
  return v;
}

/**
 * Coerce one raw entity → SketchEntity. Absent fields default (ABSENT/CONVERT); but a non-object
 * element or a wrong-typed `variants` is LOSSY — the payload cannot be represented — so it is
 * reported as a reset of that entity (coarse collection when the key is unreadable).
 */
export function coerceEntity(
  raw: unknown,
  onAnomaly: SketchAnomalyReporter = noopAnomalyReporter,
  kind?: SketchEntityCollection,
): SketchEntity {
  if (!isPlainObject(raw)) {
    if (kind) {
      onAnomaly({
        resource: kind,
        cls: 'reset',
        path: `${kind}[]`,
        message: `${describeResource(kind)} có phần tử kiểu "${typeNameOf(raw)}" thay vì object`,
        raw,
      });
    }
    return { key: '', variants: [] };
  }
  const key = asStr(raw.key);
  if (kind && 'variants' in raw && raw.variants != null && !Array.isArray(raw.variants)) {
    onAnomaly({
      resource: entityResourceKey(kind, key),
      cls: 'reset',
      path: `${kind}/${key || '?'}.variants`,
      message: `variants của ${describeResource(entityResourceKey(kind, key))} có kiểu "${typeNameOf(raw.variants)}" thay vì array`,
      raw,
    });
  }
  return {
    key,
    variants: Array.isArray(raw.variants) ? raw.variants.map(coerceVariant) : [],
  };
}

export function asEntityArray(
  v: unknown,
  onAnomaly: SketchAnomalyReporter = noopAnomalyReporter,
  kind?: SketchEntityCollection,
): SketchEntity[] {
  if (!Array.isArray(v)) {
    if (kind) {
      onAnomaly({
        resource: kind,
        cls: 'reset',
        path: kind,
        message: `${kind} có kiểu "${typeNameOf(v)}" thay vì array`,
        raw: v,
      });
    }
    return [];
  }
  return v.map((el) => {
    try {
      return coerceEntity(el, onAnomaly, kind);
    } catch (err) {
      if (kind) {
        onAnomaly({
          resource: kind,
          cls: 'reset',
          path: `${kind}[]`,
          message: `${describeResource(kind)} có phần tử gây lỗi khi đọc (${err instanceof Error ? err.message : String(err)})`,
        });
      }
      return { key: '', variants: [] };
    }
  });
}

/** Coerce one salvaged raw style blob → SketchBaseStyle, defaulting its 3 array fields.
 *  Mirrors `coerceEntity`'s philosophy: never trust a recovered element's inner shape. Without
 *  this, a salvaged non-style element reaches `styles[i].crops.find(...)` / `.illustrations
 *  .forEach(...)` in the base-workspace actions and throws. Only used on the SALVAGE paths —
 *  a well-formed `styles` array is passed through untouched. */
export function coerceStyle(raw: unknown): SketchBaseStyle {
  const r = isPlainObject(raw) ? raw : {};
  return {
    style_prompt: asStr(r.style_prompt),
    is_selected: Boolean(r.is_selected),
    image_references: Array.isArray(r.image_references)
      ? (r.image_references as SketchBaseStyle['image_references'])
      : [],
    illustrations: Array.isArray(r.illustrations) ? (r.illustrations as Illustration[]) : [],
    crops: Array.isArray(r.crops) ? (r.crops as SketchBaseStyle['crops']) : [],
  };
}
