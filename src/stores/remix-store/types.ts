// remix-store/types.ts — Store shape split into per-slice interfaces.
// `RemixStore` = intersection of all slice interfaces. Each slice factory is
// typed `StateCreator<RemixStore, SubscribeMw, [], XxxSlice>` so cross-slice
// `get()` sees the full store while each file owns only its own surface.

import type { StateCreator } from 'zustand';
import type {
  EnqueueRemixJobOutcome,
  EntitySwapTaskKey,
  Remix,
  RemixConfig,
  RemixCropSheet,
  RemixEntityRef,
  RemixJob,
  RemixServerEvent,
  RemixSpread,
  StartEntitySwapParams,
  SwapTaskStatus,
} from '@/types/remix';

// ── Patch shape exposed by job/runner helpers ────────────────────────────────

export interface RemixCropSheetPatch {
  type: 'character' | 'prop' | 'mix';
  key: string;
  /** Index into entity.crop_sheets[]. */
  sheetIndex: number;
  patch: Partial<RemixCropSheet>;
}

// ── Audio job enqueue options ────────────────────────────────────────────────

export interface StartAudioJobOptions {
  triggeredBy: 'auto-create' | 'user';
  /** Override default CLIENT_AUDIO_CHUNK_CAP. Backend may clamp further. */
  maxConcurrentChunksPerTextbox?: number;
}

// ── Entity projection (selectors) ────────────────────────────────────────────

/** All swappable entities of a remix, grouped by type, projected to the
 *  normalized `RemixEntityRef` shape consumed by SwapCropSheetModal. Returns
 *  `null` when the remix is missing (e.g. deleted via realtime). */
export interface RemixEntities {
  characters: RemixEntityRef[];
  props: RemixEntityRef[];
  mixes: RemixEntityRef[];
}

// ── Per-slice interfaces ─────────────────────────────────────────────────────

/** Remix CRUD + active selection + illustration/crop-sheet patching. */
export interface RemixCrudSlice {
  remixes: Remix[];
  activeRemixId: string | null;

  createRemix: (config: RemixConfig, name?: string) => Promise<Remix | null>;
  updateRemixConfig: (id: string, patch: RemixConfig) => Promise<boolean>;
  renameRemix: (id: string, name: string) => Promise<boolean>;
  deleteRemix: (id: string) => Promise<boolean>;
  setActiveRemixId: (id: string | null) => void;

  patchRemixIllustration: (id: string, spreads: RemixSpread[]) => void;
  patchRemixCropSheets: (id: string, updates: RemixCropSheetPatch[]) => void;
}

/** Remote background_jobs (audio/image swap): enqueue, cancel, dismiss. */
export interface RemixJobsSlice {
  jobs: RemixJob[];

  startAudioJob: (
    remixId: string,
    opts: StartAudioJobOptions,
  ) => Promise<EnqueueRemixJobOutcome>;
  startImageJob: (remixId: string) => Promise<EnqueueRemixJobOutcome>;
  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
}

/** Ephemeral per-KEY swap tasks + crop-sheet count append/remove. */
export interface RemixSwapSlice {
  /** Ephemeral per-KEY swap task map (memory-only — not persisted, no
   *  background_jobs row). Key = `${remixId}:${type}:${key}`. v1: always idle
   *  (swap deferred — `startEntitySwap` is a no-op stub). */
  entitySwapTasks: Record<EntitySwapTaskKey, SwapTaskStatus>;

  /** Modal-driven per-KEY swap trigger. DEFERRED no-op (Validation S1) — guard
   *  (`useAnySwapRunning`) + remix/entity resolution + log are real; the swap
   *  loop + API call + persist land when the swap API ships. Never sets
   *  `running`/`error` so the UI never spins. */
  startEntitySwap: (params: StartEntitySwapParams) => Promise<void>;

  /** Appends one crop sheet to an entity (`crop_sheets.length + 1`), re-layouts
   *  all crops across the new sheet count via the client-side layout engine,
   *  and persists the owning JSONB column. Optimistic with rollback on failure. */
  appendCropSheet: (
    remixId: string,
    type: 'character' | 'prop' | 'mix',
    key: string,
  ) => Promise<boolean>;

  /** Removes one crop sheet from an entity (`crop_sheets.length - 1`, clamped to
   *  `SHEET_MIN`), re-layouts all crops across the reduced sheet count, and
   *  persists the owning JSONB column. `sheetIndex` is accepted for caller
   *  parity but unused — the engine re-packs from scratch. Optimistic with
   *  rollback on failure. */
  removeCropSheet: (
    remixId: string,
    type: 'character' | 'prop' | 'mix',
    key: string,
    sheetIndex: number,
  ) => Promise<boolean>;
}

/** Server sync: snapshot remix load, realtime event apply, targeted refetch. */
export interface RemixSyncSlice {
  syncFromServer: (snapshotId: string) => Promise<void>;
  clearAll: () => void;

  applyServerEvent: (event: RemixServerEvent) => void;
  syncJobsFromServer: (userId: string) => Promise<void>;
  /** Targeted single-remix refetch. Triggered when a background job for
   *  that remix transitions to a terminal status — DB row may have new
   *  illustration/audio chunk URLs the local copy doesn't reflect. */
  refetchRemix: (remixId: string) => Promise<void>;
}

// ── Composed store ───────────────────────────────────────────────────────────

export type RemixStore = RemixCrudSlice &
  RemixJobsSlice &
  RemixSwapSlice &
  RemixSyncSlice;

/** Middleware tuple matching `index.ts` — `subscribeWithSelector` wraps the
 *  store creator (no immer; `set` is plain merge-style). Slice factories use
 *  this so `set`/`get` typings line up with the composed store. */
export type RemixStoreMutators = [['zustand/subscribeWithSelector', never]];

/** Slice factory signature: produces only `XxxSlice` but `get()` sees the
 *  full `RemixStore` for cross-slice calls. */
export type RemixSliceCreator<XxxSlice> = StateCreator<
  RemixStore,
  RemixStoreMutators,
  [],
  XxxSlice
>;
