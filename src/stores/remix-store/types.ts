// remix-store/types.ts — Store shape split into per-slice interfaces.
// `RemixStore` = intersection of all slice interfaces. Each slice factory is
// typed `StateCreator<RemixStore, SubscribeMw, [], XxxSlice>` so cross-slice
// `get()` sees the full store while each file owns only its own surface.

import type { StateCreator } from 'zustand';
import type {
  EnqueueRemixJobOutcome,
  InjectResult,
  Remix,
  RemixConfig,
  RemixCropSheet,
  RemixJob,
  RemixSpread,
  StartMixSwapParams,
} from '@/types/remix';
import type { Distribution } from '@/types/editor';
import type { JobEvent } from '@/stores/background-jobs-store';

// ── Patch shape exposed by job/runner helpers ────────────────────────────────
// Discriminated union — `patch` (legacy single-sheet merge) vs `replaceAll`
// (variant relayout rewrites every sheet in deterministic raw-variant order).
// Validation session 1: union shape required because variant relayout cannot
// be expressed as N independent index-based patches (sheet count + ordering
// both change atomically).

// rev2: crop sheets live ONLY on the batch (mix); per-entity crop_sheets
// removed (2026-05-26). `entityType` is therefore always `'mix'` and
// `entityKey` is the batch uuid (`mixes[].id`).
export type CropSheetUpdate =
  | {
      kind: 'patch';
      entityType: 'mix';
      entityKey: string;
      /** Index into batch.crop_sheets[]. */
      sheetIndex: number;
      patch: Partial<RemixCropSheet>;
    }
  | {
      kind: 'replaceAll';
      entityType: 'mix';
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

  /** Persist `remixes.distribution` (client writes is_enabled only; job handler
   *  owns status/media). Optimistic full-column set + Supabase PATCH + rollback.
   *  Mirrors BookStore.updateBook for the book source. */
  updateRemixDistribution: (id: string, dist: Distribution) => Promise<boolean>;

  patchRemixIllustration: (id: string, spreads: RemixSpread[]) => void;
  patchRemixCropSheets: (id: string, updates: CropSheetUpdate[]) => void;
}

/** Remote background_jobs (audio/mix swap): enqueue, cancel, dismiss. Plus the
 *  synchronous client-side Inject finalize (`injectFinalCrops`, no job). */
export interface RemixJobsSlice {
  jobs: RemixJob[];

  startAudioJob: (
    remixId: string,
    opts: StartAudioJobOptions,
  ) => Promise<EnqueueRemixJobOutcome>;

  /** Inject (Phase 3 — client-side finalize). Resolves the is_final winner
   *  crops, mutates the illustration blob, optimistically updates local state,
   *  then persists the full `illustration` column in ONE Supabase UPDATE (no
   *  background job). Rollback via `refetchRemix` on persist failure. Pure:
   *  returns `InjectResult` or throws (`REMIX_NOT_FOUND` / `no final crops to
   *  inject` / persist error) — the UI handler owns the toast. */
  injectFinalCrops: (remixId: string) => Promise<InjectResult>;

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
  /** Appends a NEW batch as a SUBSET clone of the active batch (rev6 — modal
   *  "Add as Batch" with per-crop selection). `selectedCropKeys` is a set of
   *  `${spread_id}/${id}` keys identifying the PRE-SWAP crops
   *  (`sheet.crops[]`, never `swap_results[].crops[]`) the user picked off the
   *  active batch. K=1 sheets packed from the subset; new batch ordered as
   *  `max(order)+1`. Optimistic push + `mixes` persist with full-remix
   *  rollback.
   *
   *  THROWS on empty selection OR zero match against the active batch lineup
   *  (stale keys) — caller must surface the error as a toast. Resolves the
   *  NEW batch id on persist success so the caller can auto-select it; `null`
   *  on guard miss / persist failure. */
  addBatch: (
    remixId: string,
    activeBatchId: string,
    selectedCropKeys: ReadonlySet<string>,
  ) => Promise<string | null>;

  /** Lazy seed of `mixes[]` for a remix opened in the modal — guards
   *  `mixes.length >= 1` and delegates to `migrateLegacyRemixToBatch`
   *  (idempotent). Resolves `true` when a batch was seeded, `false` when the
   *  remix already has ≥1 batch or guard missed. Thin alias kept on the swap
   *  slice so modal callers don't need to reach into sync-slice. */
  seedInitialBatchIfMissing: (remixId: string) => Promise<boolean>;

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

  /** R5 user take-back — set `is_final=true` on the crop matching
   *  `(spreadId, layerId)` inside `fromBatchId` AND clear `is_final` on every
   *  other batch's crop with the same key (cross-batch mutex, mirrors backend
   *  helper `_promote_is_final_for_sheet`). Gated when `anyMixSwapRunning`
   *  (defense-in-depth — UI already disables the affordance). Throws on gate
   *  reject; resolves `false` on guard miss (remix/crop not found) or persist
   *  failure (rolled back). */
  takeFinalBack: (
    remixId: string,
    spreadId: string,
    layerId: string,
    fromBatchId: string,
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

  /** ADR-037 consumer hook — receives every remix-swap job event from the
   *  unified BackgroundJobsStore (predicate-filtered to the 3 remix types).
   *  Derives the `jobs[]` projection (upsert + prune lineage) and fires a
   *  targeted `refetchRemix` on the terminal transition. */
  onRemixJobEvent: (event: JobEvent) => void;
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
