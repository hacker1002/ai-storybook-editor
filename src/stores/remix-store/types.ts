// remix-store/types.ts — Store shape split into per-slice interfaces.
// `RemixStore` = intersection of all slice interfaces. Each slice factory is
// typed `StateCreator<RemixStore, SubscribeMw, [], XxxSlice>` so cross-slice
// `get()` sees the full store while each file owns only its own surface.

import type { StateCreator } from 'zustand';
import type {
  EnqueueRemixJobOutcome,
  Remix,
  RemixConfig,
  RemixCropSheet,
  RemixJob,
  RemixServerEvent,
  RemixSpread,
  StartMixSwapParams,
} from '@/types/remix';

// ── Patch shape exposed by job/runner helpers ────────────────────────────────
// Discriminated union — `patch` (legacy single-sheet merge) vs `replaceAll`
// (variant relayout rewrites every sheet in deterministic raw-variant order).
// Validation session 1: union shape required because variant relayout cannot
// be expressed as N independent index-based patches (sheet count + ordering
// both change atomically).

export type CropSheetUpdate =
  | {
      kind: 'patch';
      entityType: 'character' | 'prop' | 'mix';
      entityKey: string;
      /** Index into entity.crop_sheets[]. */
      sheetIndex: number;
      patch: Partial<RemixCropSheet>;
    }
  | {
      kind: 'replaceAll';
      entityType: 'character' | 'prop' | 'mix';
      entityKey: string;
      sheets: RemixCropSheet[];
    };

/** Backward-compat alias — existing import paths keep building. New code
 *  should prefer `CropSheetUpdate`. */
export type RemixCropSheetPatch = CropSheetUpdate;

// ── Audio job enqueue options ────────────────────────────────────────────────

export interface StartAudioJobOptions {
  triggeredBy: 'auto-create' | 'user';
  /** Override default CLIENT_AUDIO_CHUNK_CAP. Backend may clamp further. */
  maxConcurrentChunksPerTextbox?: number;
}

// ── Per-slice interfaces ─────────────────────────────────────────────────────

/** Remix CRUD + active selection + illustration/crop-sheet patching. */
export interface RemixCrudSlice {
  remixes: Remix[];
  activeRemixId: string | null;

  createRemix: (config: RemixConfig, name?: string) => Promise<Remix | null>;
  renameRemix: (id: string, name: string) => Promise<boolean>;
  deleteRemix: (id: string) => Promise<boolean>;
  setActiveRemixId: (id: string | null) => void;

  patchRemixIllustration: (id: string, spreads: RemixSpread[]) => void;
  patchRemixCropSheets: (id: string, updates: CropSheetUpdate[]) => void;
}

/** Remote background_jobs (audio/image/mix swap): enqueue, cancel, dismiss. */
export interface RemixJobsSlice {
  jobs: RemixJob[];

  startAudioJob: (
    remixId: string,
    opts: StartAudioJobOptions,
  ) => Promise<EnqueueRemixJobOutcome>;
  startImageJob: (remixId: string) => Promise<EnqueueRemixJobOutcome>;

  /** Modal-driven batch (mix) crop-sheet swap (rev2 — api/jobs/05). POST
   *  `/api/jobs/remix/{id}/mix-swap` + optimistic seed `remix_mix_swap` job.
   *  Guards: an already-running mix swap for the remix no-ops to `skipped`.
   *  Throws `EnqueueJobError` (with `code`) on 422/non-2xx so the modal can
   *  toast MISSING_VARIANT_REFERENCE / TOO_MANY_SWAP_TARGETS / NO_SWAP_TARGETS
   *  distinctly. The swap LOOP runs backend; the client only enqueues + reflects
   *  realtime job_upsert into `jobs[]`. */
  startMixSwap: (
    params: StartMixSwapParams,
  ) => Promise<EnqueueRemixJobOutcome>;

  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
}

/** Batch lifecycle (add/remove batch + append/remove batch sheet) + per-variant
 *  visual-swap persist (rev2 — batch model). */
export interface RemixSwapSlice {
  /** Appends a NEW batch (fresh uuid + K=1 sheets from all enabled-subject
   *  crops). Optimistic push + `mixes` persist with full-remix rollback.
   *  Resolves `true` on success. */
  addBatch: (remixId: string) => Promise<boolean>;

  /** Removes a batch by id. Guarded so the last batch (`mixes.length ===
   *  BATCH_MIN`) cannot be removed. Optimistic + rollback. Resolves `true` on
   *  success. */
  removeBatch: (remixId: string, batchId: string) => Promise<boolean>;

  /** Appends one crop sheet to a batch (clamped to `SHEET_MAX`). Re-groups ALL
   *  crops from the frozen illustration and re-packs at K+1 via the layout
   *  engine, then `replaceAll` on the batch's `crop_sheets[]`. DESTRUCTIVE:
   *  clears `swap_results` of the batch — caller MUST gate. Optimistic with
   *  rollback. */
  appendBatchSheet: (remixId: string, batchId: string) => Promise<boolean>;

  /** Removes one crop sheet from a batch (clamped to `SHEET_MIN`). `sheetIndex`
   *  is accepted for caller-API parity but unused (engine re-packs from
   *  scratch). DESTRUCTIVE: clears `swap_results` of the batch — caller MUST
   *  gate. Optimistic with rollback. */
  removeBatchSheet: (
    remixId: string,
    batchId: string,
    sheetIndex: number,
  ) => Promise<boolean>;

  /** Persist-writer for a per-variant swap result. Writes
   *  `characters[charKey].variants[variantKey].visual_swap_url` and persists
   *  the whole `characters` JSONB column. Optimistic with full-remix snapshot
   *  rollback on error (single-writer assumption). `imageUrl=null` clears the
   *  field (revert). Char-only — does NOT write `remix_config` or
   *  `background_jobs`.
   *
   *  Resolves `true` on a successful Supabase write; `false` on a guard miss
   *  (remix/char/variant not found) or after a persist error has been rolled
   *  back. Callers must surface `false` as an error (do NOT show the optimistic
   *  result as committed). */
  setVariantVisualSwapUrl: (
    remixId: string,
    charKey: string,
    variantKey: string,
    imageUrl: string | null,
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

  /** Lazy migration of a legacy remix to the rev2 batch model. Idempotent —
   *  only runs when a legacy shape is detected (no batch / `mixes[].keys[]` /
   *  entity crops). Rebuilds `mixes` as a single batch from `groupCropsForBatch`
   *  (reads frozen illustration tags), clears entity `crop_sheets`, and persists
   *  `{ mixes, characters, props }` once. Called by the modal root on-mount
   *  (Phase 06). No-op (resolves `false`) when no migration needed. */
  migrateLegacyRemixToBatch: (remixId: string) => Promise<boolean>;
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
