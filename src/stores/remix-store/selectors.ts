// remix-store/selectors.ts — Read-side `use*` hooks for the remix store.
// Kept out of `create()` so the store factory stays compose-only. Imports the
// store hook from `index.ts`; `index.ts` re-exports this module (`export *`)
// — selectors must NOT be imported back into the create() body (circular).

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type {
  BatchSwapTaskStatus,
  Remix,
  RemixBatch,
  RemixJob,
  RemixTraitChoice,
  RemixVariantEntity,
  RemixVariantNode,
} from '@/types/remix';
import { useHumans } from '@/stores/humans-store';
import { selectCanInject } from './selectors/select-final-crops';
import { useRemixStore } from './index';

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

/**
 * Inject gate: true iff the remix has ≥1 batch with a selected `swap_result`
 * yielding an injectable `is_final` winner crop — i.e.
 * `resolveFinalCrops(remix).length > 0`. MIRRORS `injectFinalCrops`'s
 * precondition (which throws `'no final crops to inject'` when finals are
 * empty), so the button-enabled state and the action precondition cannot drift.
 *
 * Perf: subscribes to the narrowest stable raw ref (`mixes` array — stable
 * across renders unless swap data mutates) and memoizes the allocating
 * `selectCanInject` / `resolveFinalCrops` derivation keyed on that ref, never
 * on a freshly-mapped array (memory feedback_zustand_useshallow_nested_arrays).
 */
export const useCanInject = (remixId: string): boolean => {
  const mixes = useRemixStore(
    (s) => s.remixes.find((r) => r.id === remixId)?.mixes,
  );

  return useMemo(() => {
    if (!mixes || mixes.length === 0) return false;
    // selectCanInject only reads `remix.mixes`; pass a minimal shape keyed on
    // the stable `mixes` ref. True ⟺ ≥1 batch has an injectable is_final crop.
    return selectCanInject({ mixes } as Remix);
  }, [mixes]);
};

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

export const useHasPendingJob = (): boolean =>
  useRemixStore((s) =>
    s.jobs.some((j) => j.status === 'queued' || j.status === 'running'),
  );

/** Frozen remix_config character picks joined with the live humans cache.
 *  Returned shape feeds the Generate gating + swap request build in Phase 03:
 *    - `human_id`, `visual`, `traits[]` — read verbatim from the FROZEN
 *      `remix_config.characters[charKey]` (the create-time staging values).
 *    - `converted_image` — joined from the humans cache (same source the CREATE
 *      modal feeds into `runCharacterSwap`: `useHumans()` → `Human[]`, keyed by
 *      id, resolved via `visualProfiles.find(vp.name === visual).convertedImage`,
 *      mirroring `buildSwapVisualCoreRequest`). Camel-case domain shape — NOT
 *      the snake_case DB row.
 *
 *  Returns `null` when the remix is missing, or `charKey` is not present in
 *  `remix_config.characters` (prop / unknown key). `converted_image` is `null`
 *  when the human/visual is unpicked, the human is absent from cache, or the
 *  visual profile has no normalized image yet (Generate stays disabled).
 *
 *  Memoized on `[configChar, humans]` — `configChar` is ref-stable until an
 *  action replaces the remix row; `humans` is the stable store array. */
export interface RemixConfigCharacterView {
  human_id: string | null;
  visual: string | null;
  traits: RemixTraitChoice[];
  converted_image: string | null;
}

export const useRemixConfigCharacter = (
  remixId: string,
  charKey: string,
): RemixConfigCharacterView | null => {
  const configChar = useRemixStore(
    (s) =>
      s.remixes
        .find((r) => r.id === remixId)
        ?.remix_config.characters.find((c) => c.key === charKey) ?? null,
  );
  const humans = useHumans();

  return useMemo<RemixConfigCharacterView | null>(() => {
    if (!configChar) return null;

    let convertedImage: string | null = null;
    if (configChar.human_id && configChar.visual) {
      const human = humans.find((h) => h.id === configChar.human_id);
      const profile = human?.visualProfiles.find(
        (vp) => vp.name === configChar.visual,
      );
      convertedImage = profile?.convertedImage ?? null;
    }

    return {
      human_id: configChar.human_id,
      visual: configChar.visual,
      traits: configChar.traits,
      converted_image: convertedImage,
    };
  }, [configChar, humans]);
};


// ── rev2 selectors (Variants / Batches tabs) ─────────────────────────────────

/** Pick the display illustration of a variant: the selected one, else the
 *  first, else null. Shared by `useRemixVariants` projection. */
function pickIllustration(
  variant: { illustrations?: { media_url: string; is_selected: boolean }[] },
): string | null {
  const list = variant.illustrations ?? [];
  const selected = list.find((i) => i.is_selected);
  return selected?.media_url ?? list[0]?.media_url ?? null;
}

/** Project one char/prop variant → `RemixVariantNode` for the Variants tab.
 *  Accepts the structural shape shared by char/prop remix variants. */
function toVariantNode(v: {
  key: string;
  name?: string;
  type: number;
  illustrations?: { media_url: string; is_selected: boolean }[];
  visual_swap_url?: string | null;
}): RemixVariantNode {
  return {
    variantKey: v.key,
    name: v.name ?? v.key,
    illustrationUrl: pickIllustration(v),
    visualSwapUrl: v.visual_swap_url ?? null,
    isBase: v.type === 0,
  };
}

/**
 * Projects a remix's characters + props into `RemixVariantEntity[]` for the
 * Variants tab. Pure derive from the remix row.
 *
 * RE-RENDER NOTE — useMemo deps = `[remix]` ONLY (stable raw row ref). The
 * `.map()` arrays are fresh each call so a shallow compare would loop
 * (memory feedback_zustand_useshallow_nested_arrays). The selector reads the
 * raw remix ref directly — ref-stable until an action replaces the row.
 */
export const useRemixVariants = (
  remixId: string | null | undefined,
): RemixVariantEntity[] => {
  const remix = useRemixStore(
    (s) => (remixId ? s.remixes.find((r) => r.id === remixId) ?? null : null),
  );

  return useMemo<RemixVariantEntity[]>(() => {
    if (!remix) return [];
    const out: RemixVariantEntity[] = [];
    for (const c of remix.characters) {
      out.push({
        type: 'character',
        key: c.key,
        name: c.name,
        variants: (c.variants ?? []).map(toVariantNode),
      });
    }
    for (const p of remix.props) {
      out.push({
        type: 'prop',
        key: p.key,
        name: p.name,
        variants: (p.variants ?? []).map(toVariantNode),
      });
    }
    return out;
  }, [remix]);
};

/** Derive a batch's swap task from `jobs[]` (single source of truth — no
 *  separate ephemeral map). Latest `remix_mix_swap` job for (remixId, batchId);
 *  maps status → UI task. */
export function deriveBatchSwapTask(
  jobs: RemixJob[],
  remixId: string,
  batchId: string,
): BatchSwapTaskStatus {
  const matches = jobs.filter(
    (j) =>
      j.phase === 'remix_mix_swap' &&
      j.remixId === remixId &&
      j.batchId === batchId,
  );
  if (matches.length === 0) return { state: 'idle' };
  const job = matches.reduce((latest, cur) =>
    cur.createdAt > latest.createdAt ? cur : latest,
  );

  if (job.status === 'queued' || job.status === 'running') {
    return { state: 'running', current: job.currentStep, total: job.totalSteps };
  }

  const failedSheets =
    typeof job.result?.failed_sheets === 'number' ? job.result.failed_sheets : 0;

  if (job.status === 'failed' || job.status === 'cancelled') {
    return {
      state: 'error',
      message: job.result?.errors?.[0]?.message ?? 'Swap failed',
      failedSheets,
    };
  }

  // completed — partial when any sheet errored.
  const errors = job.result?.errors ?? [];
  if (errors.length > 0) {
    return {
      state: 'error',
      message: errors[0]?.message ?? 'Swap partially failed',
      failedSheets: failedSheets || errors.length,
    };
  }
  return { state: 'idle' };
}

/**
 * Projects a remix's `mixes[]` into `RemixBatch[]` (id/order/name/crop_sheets +
 * derived swapTask), sorted by `order`. Pure derive from `remix` + `jobs`.
 *
 * RE-RENDER NOTE — useMemo deps = `[remix, jobs]` (both stable raw refs). The
 * projection arrays are fresh each call; shallow compare would loop. `jobs` is
 * the per-remix filtered slice from `useJobsForRemix` (its own useShallow guard
 * keeps the ref stable across unrelated job updates).
 */
export const useRemixBatches = (
  remixId: string | null | undefined,
): RemixBatch[] => {
  const remix = useRemixStore(
    (s) => (remixId ? s.remixes.find((r) => r.id === remixId) ?? null : null),
  );
  const jobs = useJobsForRemix(remixId ?? '');

  return useMemo<RemixBatch[]>(() => {
    if (!remix) return [];
    return remix.mixes
      .map((m) => ({
        id: m.id,
        order: m.order,
        name: m.name,
        crop_sheets: m.crop_sheets,
        swapTask: deriveBatchSwapTask(jobs, remix.id, m.id),
      }))
      .sort((a, b) => a.order - b.order);
  }, [remix, jobs]);
};

/** True when ANY `remix_mix_swap` job of the remix is queued/running. Guards the
 *  modal against firing a second swap. Boolean primitive — ref-stable by value. */
export const useAnyMixSwapRunning = (
  remixId: string | null | undefined,
): boolean =>
  useRemixStore((s) =>
    !!remixId &&
    s.jobs.some(
      (j) =>
        j.phase === 'remix_mix_swap' &&
        j.remixId === remixId &&
        (j.status === 'queued' || j.status === 'running'),
    ),
  );

// ── Action bundle ────────────────────────────────────────────────────────────

export const useRemixActions = () =>
  useRemixStore(
    useShallow((s) => ({
      createRemix: s.createRemix,
      renameRemix: s.renameRemix,
      deleteRemix: s.deleteRemix,
      setActiveRemixId: s.setActiveRemixId,
      updateRemixDistribution: s.updateRemixDistribution,
      refetchRemix: s.refetchRemix,
      startAudioJob: s.startAudioJob,
      injectFinalCrops: s.injectFinalCrops,
      cancelJob: s.cancelJob,
      dismissJob: s.dismissJob,
      syncFromServer: s.syncFromServer,
      patchRemixIllustration: s.patchRemixIllustration,
      patchRemixCropSheets: s.patchRemixCropSheets,
      startMixSwap: s.startMixSwap,
      addBatch: s.addBatch,
      seedInitialBatchIfMissing: s.seedInitialBatchIfMissing,
      removeBatch: s.removeBatch,
      appendBatchSheet: s.appendBatchSheet,
      removeBatchSheet: s.removeBatchSheet,
      setVariantVisualSwapUrl: s.setVariantVisualSwapUrl,
      takeFinalBack: s.takeFinalBack,
    })),
  );
