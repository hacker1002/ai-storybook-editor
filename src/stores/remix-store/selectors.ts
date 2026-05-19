// remix-store/selectors.ts — Read-side `use*` hooks for the remix store.
// Kept out of `create()` so the store factory stays compose-only. Imports the
// store hook from `index.ts`; `index.ts` re-exports this module (`export *`)
// — selectors must NOT be imported back into the create() body (circular).

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { canonicalMixKey } from '@/types/remix';
import type { Remix, RemixJob, SwapTaskStatus } from '@/types/remix';
import { useRemixStore } from './index';
import { buildEntityTaskKey, IDLE_SWAP_TASK } from './slice-helpers';
import type { RemixEntities } from './types';

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

export const useRemixEntities = (remixId: string): RemixEntities | null => {
  // Select the raw remix row — a referentially stable object that only changes
  // when an action replaces it. `useShallow` on the projected shape would loop:
  // the projection's `.map()` arrays are fresh every call, so a shallow compare
  // never settles. Project under `useMemo` keyed on the stable `remix` instead.
  const remix = useRemixStore(
    (s) => s.remixes.find((r) => r.id === remixId) ?? null,
  );

  return useMemo<RemixEntities | null>(() => {
    if (!remix) return null;
    return {
      characters: remix.characters.map((c) => ({
        type: 'character' as const,
        key: c.key,
        name: c.name,
        crop_sheets: c.crop_sheets,
      })),
      props: remix.props.map((p) => ({
        type: 'prop' as const,
        key: p.key,
        name: p.name,
        crop_sheets: p.crop_sheets,
      })),
      mixes: remix.mixes.map((m) => ({
        type: 'mix' as const,
        key: canonicalMixKey(m.keys),
        name: m.name,
        crop_sheets: m.crop_sheets,
      })),
    };
  }, [remix]);
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
