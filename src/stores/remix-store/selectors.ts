// remix-store/selectors.ts — Read-side `use*` hooks for the remix store.
// Kept out of `create()` so the store factory stays compose-only. Imports the
// store hook from `index.ts`; `index.ts` re-exports this module (`export *`)
// — selectors must NOT be imported back into the create() body (circular).

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { canonicalMixKey } from '@/types/remix';
import type {
  Remix,
  RemixEntityRef,
  RemixJob,
  SwapTaskStatus,
} from '@/types/remix';
import type { Illustration } from '@/types/prop-types';
import { useRemixStore } from './index';
import { buildEntityTaskKey, IDLE_SWAP_TASK } from './slice-helpers';
import { buildVariantGroups } from './build-variant-groups';
import type { RemixEntities } from './types';
import type { RemixVariantGroup } from '@/types/remix';

/**
 * Append a synthetic 'base' variant group covering any orphan sheets whose
 * `variant_key === 'base'` or `null` that are NOT already claimed by a
 * designer-defined variant group. Cases covered:
 *  - Designer has not defined any variants yet (`groups.length === 0`)
 *  - All sheets reference `variant_key === 'base'` (Phase 02 engine fallback)
 *  - Designer variants exist BUT engine produced stray base/null sheets that
 *    aren't bucketed into any designer variant (would be silently invisible
 *    in sidebar otherwise — user couldn't reach them)
 *
 * Without this synthesis, orphan sheets would never render. Keeps the UI
 * uniform (entity → variant → sheet) at zero designer cost.
 *
 * No-op when every sheet index is already claimed. If designer literally
 * keyed a variant `'base'`, `buildVariantGroups` already claimed those
 * indices and they won't be duplicated here.
 *
 * Recommended deviation from spec by Phase 06 caller — see phase doc
 * "'base' synthesis concern" section.
 */
function withSyntheticBaseFallback(
  entity: { crop_sheets: { variant_key: string | null }[] },
  groups: RemixVariantGroup[],
): RemixVariantGroup[] {
  if (entity.crop_sheets.length === 0) return groups;
  const claimedIndices = new Set<number>();
  for (const g of groups) {
    for (const idx of g.sheetIndices) claimedIndices.add(idx);
  }
  const orphanBaseIndices: number[] = [];
  for (let i = 0; i < entity.crop_sheets.length; i += 1) {
    if (claimedIndices.has(i)) continue;
    const vk = entity.crop_sheets[i].variant_key;
    if (vk === 'base' || vk === null) orphanBaseIndices.push(i);
  }
  if (orphanBaseIndices.length === 0) return groups;
  return [
    ...groups,
    {
      variantKey: 'base',
      name: 'Base',
      sheetIndices: orphanBaseIndices,
    },
  ];
}

// ── Remix selectors ──────────────────────────────────────────────────────────

export const useRemixes = (): Remix[] => useRemixStore((s) => s.remixes);

export const useActiveRemixId = (): string | null =>
  useRemixStore((s) => s.activeRemixId);

export const useActiveRemix = (): Remix | null =>
  useRemixStore((s) =>
    s.activeRemixId
      ? s.remixes.find((r) => r.id === s.activeRemixId) ?? null
      : null,
  );

export const useRemixById = (id: string | null | undefined): Remix | null =>
  useRemixStore((s) =>
    id ? s.remixes.find((r) => r.id === id) ?? null : null,
  );

// ── Job selectors ────────────────────────────────────────────────────────────

const EMPTY_JOBS: RemixJob[] = [];

export const useJobsForRemix = (remixId: string): RemixJob[] =>
  useRemixStore(
    useShallow((s) => s.jobs.filter((j) => j.remixId === remixId) ?? EMPTY_JOBS),
  );

export const useLatestAudioJob = (remixId: string): RemixJob | null =>
  useRemixStore((s) => {
    const matches = s.jobs.filter(
      (j) => j.remixId === remixId && j.phase === 'audio',
    );
    if (matches.length === 0) return null;
    // Sort DESC by createdAt — latest first.
    return matches.reduce((latest, cur) =>
      cur.createdAt > latest.createdAt ? cur : latest,
    );
  });

export const useLatestImageJob = (remixId: string): RemixJob | null =>
  useRemixStore((s) => {
    const matches = s.jobs.filter(
      (j) => j.remixId === remixId && j.phase === 'image',
    );
    if (matches.length === 0) return null;
    return matches.reduce((latest, cur) =>
      cur.createdAt > latest.createdAt ? cur : latest,
    );
  });

export const useHasPendingJob = (): boolean =>
  useRemixStore((s) =>
    s.jobs.some((j) => j.status === 'queued' || j.status === 'running'),
  );

// ── Entity selectors ─────────────────────────────────────────────────────────

/**
 * Projects all swappable entities of a remix into the `RemixEntityRef` shape
 * consumed by the swap modal. Char/prop entities get `variants` populated via
 * `buildVariantGroups(entity, rawVariants)` where `rawVariants = c.variants` /
 * `p.variants` from the remix row. Mix entity always has `variants: []`.
 *
 * RE-RENDER NOTE — useMemo deps = `[remix]` ONLY (stable raw row ref). The
 * projection's `.map()` arrays are fresh every call, so a shallow compare
 * pattern would loop forever (memory `feedback_zustand_useshallow_nested_arrays.md`).
 * `rawVariants` is read directly from the stable `c.variants` / `p.variants`
 * field — ref-stable until an action replaces the remix row.
 */
export const useRemixEntities = (remixId: string): RemixEntities | null => {
  const remix = useRemixStore(
    (s) => s.remixes.find((r) => r.id === remixId) ?? null,
  );

  return useMemo<RemixEntities | null>(() => {
    if (!remix) return null;
    return {
      characters: remix.characters.map((c): RemixEntityRef => {
        const rawVariants = c.variants ?? [];
        const ref: RemixEntityRef = {
          type: 'character',
          key: c.key,
          name: c.name,
          crop_sheets: c.crop_sheets,
          variants: [],
        };
        ref.variants = withSyntheticBaseFallback(
          ref,
          buildVariantGroups(ref, rawVariants),
        );
        return ref;
      }),
      props: remix.props.map((p): RemixEntityRef => {
        const rawVariants = p.variants ?? [];
        const ref: RemixEntityRef = {
          type: 'prop',
          key: p.key,
          name: p.name,
          crop_sheets: p.crop_sheets,
          variants: [],
        };
        ref.variants = withSyntheticBaseFallback(
          ref,
          buildVariantGroups(ref, rawVariants),
        );
        return ref;
      }),
      mixes: remix.mixes.map((m) => ({
        type: 'mix' as const,
        key: canonicalMixKey(m.keys),
        name: m.name,
        crop_sheets: m.crop_sheets,
        // Mix entity never has variants — `buildVariantGroups` returns `[]`
        // for mix anyway, but skip the call to avoid the helper warn.
        variants: [],
      })),
    };
  }, [remix]);
};

/**
 * Variant illustrations projection for a single char/prop entity. Returns
 * `Record<variantKey, Illustration[]>` read from
 * `Remix.characters[]/props[].variants[].illustrations[]`. Consumed by Phase
 * 05 `VariantsVisualModal` to render variant-thumbnail previews.
 *
 * Returns `{}` for mix entity (mix has no variants) and when remix/entity is
 * missing. Memoized on the raw remix row ref (same loop-avoidance pattern as
 * `useRemixEntities`).
 */
export const useEntityVariantIllustrations = (
  remixId: string,
  type: 'character' | 'prop',
  entityKey: string,
): Record<string, Illustration[]> => {
  const remix = useRemixStore(
    (s) => s.remixes.find((r) => r.id === remixId) ?? null,
  );

  return useMemo<Record<string, Illustration[]>>(() => {
    if (!remix) return {};
    const variants =
      type === 'character'
        ? remix.characters.find((c) => c.key === entityKey)?.variants
        : remix.props.find((p) => p.key === entityKey)?.variants;
    if (!variants) return {};
    return variants.reduce<Record<string, Illustration[]>>((acc, v) => {
      acc[v.key] = v.illustrations ?? [];
      return acc;
    }, {});
  }, [remix, type, entityKey]);
};

/** Reads the ephemeral swap task for an entity KEY. Defaults to a stable idle
 *  object so callers never trigger a re-render on the default. v1: always idle
 *  (swap deferred — `startEntitySwap` is a no-op stub). */
export const useEntitySwapTask = (
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
): SwapTaskStatus =>
  useRemixStore(
    (s) =>
      s.entitySwapTasks[buildEntityTaskKey(remixId, type, key)] ??
      IDLE_SWAP_TASK,
  );

/** True when ANY entity of the remix has a running swap task. Guards the modal
 *  against firing a second swap. v1: always `false` (swap deferred). */
export const useAnySwapRunning = (remixId: string): boolean =>
  useRemixStore((s) => {
    const prefix = `${remixId}:`;
    return Object.entries(s.entitySwapTasks).some(
      ([k, v]) => k.startsWith(prefix) && v.state === 'running',
    );
  });

// ── Action bundle ────────────────────────────────────────────────────────────

export const useRemixActions = () =>
  useRemixStore(
    useShallow((s) => ({
      createRemix: s.createRemix,
      updateRemixConfig: s.updateRemixConfig,
      renameRemix: s.renameRemix,
      deleteRemix: s.deleteRemix,
      setActiveRemixId: s.setActiveRemixId,
      startAudioJob: s.startAudioJob,
      startImageJob: s.startImageJob,
      cancelJob: s.cancelJob,
      dismissJob: s.dismissJob,
      syncFromServer: s.syncFromServer,
      syncJobsFromServer: s.syncJobsFromServer,
      patchRemixIllustration: s.patchRemixIllustration,
      patchRemixCropSheets: s.patchRemixCropSheets,
      startEntitySwap: s.startEntitySwap,
      appendCropSheet: s.appendCropSheet,
      removeCropSheet: s.removeCropSheet,
    })),
  );
