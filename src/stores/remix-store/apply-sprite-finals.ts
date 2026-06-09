// apply-sprite-finals.ts — Pure helpers for sprite-swap finalize (auto-apply).
//
// The sprite-swap job (api/jobs/02) sets `is_final` on the winning swapped crop
// per `(type, object_key, variant_key)` cell across all sprites (R1, backend).
// The FE is the WRITER of `characters[].variants[].visual_swap_url` /
// `props[].variants[].visual_swap_url` — it resolves the is_final winners and
// reflects each onto its variant. NON-DESTRUCTIVE (only a reference url is set —
// unlike mix Inject which rewrites the illustration), so it auto-applies on job
// terminal.
//
// Writer separation (Validation S1): job writes the `sprites` column (is_final);
// FE-final writes `characters` / `props` (visual_swap_url) — DIFFERENT columns
// from mix Inject (`illustration`), so no lost-update across planes.
//
// PURE: no I/O, no React. The store action owns persistence + rollback.

import type { Remix, RemixCharacter, RemixProp } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ApplySpriteFinals');

/** A resolved sprite-swap winner — one per `(type, object_key, variant_key)`. */
export interface SpriteFinalEntry {
  type: 'character' | 'prop';
  object_key: string;
  variant_key: string;
  media_url: string;
  sprite_id: string;
}

const makeKey = (type: string, objectKey: string, variantKey: string) =>
  `${type}/${objectKey}/${variantKey}`;

/**
 * Resolve the is_final winner crop per cell across all sprites. Reads ONLY
 * `sprites[].crop_sheets[].swap_results[is_selected].crops[is_final]`. Defensive:
 * on >1 final for the same cell, highest `sprite.order` wins (lex tie-break on
 * sprite.id) and logs. Mirror of `resolveFinalCrops` (mix plane).
 */
export function resolveSpriteFinals(
  remix: Remix | null | undefined,
): SpriteFinalEntry[] {
  if (!remix) return [];
  const sprites = remix.sprites ?? [];

  interface Pending {
    entry: SpriteFinalEntry;
    order: number;
  }
  const result = new Map<string, Pending>();
  let breaches = 0;

  for (const sprite of sprites) {
    if (!sprite?.crop_sheets) continue;
    for (const sheet of sprite.crop_sheets) {
      const selected = sheet?.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops) continue;
      for (const crop of selected.crops) {
        if (crop?.is_final !== true) continue;
        const key = makeKey(crop.type, crop.object_key, crop.variant_key);
        const existing = result.get(key);
        const candidate: Pending = {
          entry: {
            type: crop.type,
            object_key: crop.object_key,
            variant_key: crop.variant_key,
            media_url: crop.media_url,
            sprite_id: sprite.id,
          },
          order: sprite.order,
        };
        if (!existing) {
          result.set(key, candidate);
        } else {
          breaches += 1;
          const challengerWins =
            sprite.order > existing.order ||
            (sprite.order === existing.order && sprite.id < existing.entry.sprite_id);
          if (challengerWins) result.set(key, candidate);
          log.warn('resolveSpriteFinals', 'invariant breach (>1 final)', { key });
        }
      }
    }
  }

  if (breaches > 0) {
    log.error('resolveSpriteFinals', 'invariant breaches detected', { count: breaches });
  }
  log.debug('resolveSpriteFinals', 'done', { finalCount: result.size });
  return Array.from(result.values(), (v) => v.entry);
}

export interface SpriteFinalsPatch {
  characters: RemixCharacter[];
  props: RemixProp[];
  /** Number of variants whose `visual_swap_url` was set/changed. */
  appliedCount: number;
}

/**
 * Apply resolved sprite finals onto fresh `characters` / `props` arrays
 * (visual_swap_url = winner media_url). Pure — returns NEW arrays (clones only
 * the touched entities/variants); unchanged entities keep their ref. Idempotent
 * — a final equal to the current value is not counted as applied.
 */
export function applySpriteFinalsToVariants(
  remix: Remix,
  finals: SpriteFinalEntry[],
): SpriteFinalsPatch {
  // Group finals by (type, object_key) → Map<variant_key, media_url>.
  const charFinals = new Map<string, Map<string, string>>();
  const propFinals = new Map<string, Map<string, string>>();
  for (const f of finals) {
    const target = f.type === 'character' ? charFinals : propFinals;
    let vm = target.get(f.object_key);
    if (!vm) {
      vm = new Map();
      target.set(f.object_key, vm);
    }
    vm.set(f.variant_key, f.media_url);
  }

  let appliedCount = 0;

  const patchEntities = <T extends { key: string; variants: { key: string; visual_swap_url?: string | null }[] }>(
    entities: T[],
    finalsByObj: Map<string, Map<string, string>>,
  ): T[] =>
    entities.map((e) => {
      const vm = finalsByObj.get(e.key);
      if (!vm) return e;
      let changed = false;
      const variants = e.variants.map((v) => {
        if (!vm.has(v.key)) return v;
        const url = vm.get(v.key)!;
        if (v.visual_swap_url === url) return v;
        changed = true;
        appliedCount += 1;
        return { ...v, visual_swap_url: url };
      });
      return changed ? { ...e, variants } : e;
    });

  const characters = patchEntities(remix.characters, charFinals);
  const props = patchEntities(remix.props, propFinals);

  log.info('applySpriteFinalsToVariants', 'patched', {
    remixId: remix.id,
    finalsCount: finals.length,
    appliedCount,
  });
  return { characters, props, appliedCount };
}
