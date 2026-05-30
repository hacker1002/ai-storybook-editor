// remix.ts — Domain types for Remix feature (DB row + ephemeral inject job state)
// DB row JSONB structure: snapshot illustration/characters/props snapshot + remix_config + mixes.

import type { BaseSpread, SpreadTag } from './spread-types';
import type { IllustrationData, Section } from './illustration-types';
import type { Character, CharacterVariant } from './character-types';
import type { Prop, PropVariant, Crop } from './prop-types';

// Re-export SpreadTag so swap-modal consumers have a single import point.
export type { SpreadTag } from './spread-types';
import type { RemixLanguageCode } from './editor';
import type { Human, TraitType } from './human';

// Re-export book-level remix entries so consumers have a single import point.
export type {
  BookRemix,
  RemixLanguageEntry,
  RemixVoiceEntry,
  RemixTraitEntry,
  RemixCharacterEntry,
  RemixPropEntry,
  RemixLanguageCode,
  CharacterRemixType,
} from './editor';

// ── CropSheet (remix variant) ────────────────────────────────────────────────
// Base CropSheet from prop-types.ts has `{title, image_url, crops[]}`.
// Remix variant adds `swap_results[]` to record AI-driven swap output.

// ── Swap modal tabs (rev2) ───────────────────────────────────────────────────
/** Top-level tab of SwapCropSheetModal (rev2 — replaces Characters/Props/Mixes). */
export type RemixModalTab = 'variants' | 'batches' | 'lotties';

/** Re-cut crop produced by the mix-swap job (api/jobs/05). Backend service that
 *  emits these is deferred — FE v1 declares the type for realtime parity but
 *  does NOT render from `crops[]` (only `swap_results[].media_url`). */
export interface SwapResultCrop {
  spread_id: string;
  id: string;
  geometry: { x: number; y: number; w: number; h: number };
  media_url: string;
  tags: SpreadTag[];
  /** Cross-batch winner mutex (2026-05-29). Per `(spread_id, id)` layer position,
   *  EXACTLY 1 crop has `is_final=true` across all batches at steady state.
   *  Reader: absent / undefined / false → unmarked. ONLY valid when parent
   *  `swap_results.is_selected=true` (history `is_selected=false` is rubbish).
   *  Ownership matrix:
   *    R1 backend (job 05) — auto-promote on swap success + clear cross-batch
   *    R2 backend         — re-swap same batch = idempotent consequence of R1
   *    R3 FE store        — orphan reconcile on delete/relayout, fallback highest `batch.order`
   *    R4 backend         — `force_resweep=false` idempotent skip = no-op
   *    R5 FE action       — user take-back overrides any rule */
  is_final?: boolean;
}

export interface SwapResult {
  media_url: string;
  created_time: string;
  is_selected: boolean;
  /** rev2 — re-cut output (backend deferred). FE v1 does not consume. */
  crops: SwapResultCrop[];
}

/** Re-export of crop entry shape from prop-types for consumer convenience. */
export type RemixCrop = Crop;

/** Crop entry stored on a batch crop sheet (rev2). Replaces the legacy `Crop`
 *  shape: carries multi-subject `tags[]` instead of `object_key`/`variant`.
 *  Affinity primary subject = `tags[0].object_key`; `geometry` is the engine
 *  OUTPUT (px, sheet-relative — placeholder until layout runs in Phase 03). */
export interface CropEntry {
  spread_id: string;
  id: string;
  layer_kind: string;
  spread_number: number;
  aspect_ratio: string;
  name: string;
  tags: SpreadTag[];
  media_url: string;
  geometry: { x: number; y: number; w: number; h: number };
}

export interface RemixCropSheet {
  title: string;
  /** Sheet frame size (px) — computed by crop-sheet-layout-engine. Additive
   *  JSONB field (DB-CHANGELOG 2026-05-19), no migration needed. */
  sheet_geometry: { width: number; height: number };
  /** @deprecated build API removed (2026-05-19) — usually empty ''. Kept for
   *  backward-compat; client now composes the sheet from crops + sheet_geometry. */
  image_url: string;
  swap_results: SwapResult[];
  /** rev2 — crops carry multi-subject `tags[]` (CropEntry), replacing the legacy
   *  per-variant `Crop` shape. Relayout no longer groups by variant. */
  crops: CropEntry[];
}

// ── Cloned entity snapshots (DB JSONB columns) ───────────────────────────────
// Mirror snapshot Character/Prop shape but replace `crop_sheets` with the
// remix variant carrying `swap_results`. Prop also drops `sounds` (not used).

/** Character variant extended for remix — adds `visual_swap_url`, the per-variant
 *  output of `/api/remix/swap-character-visual`. Populated at clone time on the
 *  base variant (type=0) from `remix_config.characters[].base_image_url`
 *  (DB-CHANGELOG 2026-05-20 / Validation S1b). Optional → legacy rows omit it.
 *  NOTE: this is distinct from `RemixCharacterChoice.base_image_url`, which is
 *  the modal staging value; the variant field is the persisted result. */
export type RemixCharacterVariant = CharacterVariant & {
  visual_swap_url?: string | null;
};

/** Prop variant extended for remix — mirrors `RemixCharacterVariant` so the
 *  cloned prop variants match the DB schema (`props[].variants[].visual_swap_url`).
 *  Char-only feature: props never get a Generate action, but the field must
 *  exist on the type for parity with the persisted JSONB column. */
export type RemixPropVariant = PropVariant & {
  visual_swap_url?: string | null;
};

export type RemixCharacter = Omit<Character, 'crop_sheets' | 'variants'> & {
  crop_sheets: RemixCropSheet[];
  variants: RemixCharacterVariant[];
};

export type RemixProp = Omit<Prop, 'crop_sheets' | 'sounds' | 'variants'> & {
  crop_sheets: RemixCropSheet[];
  variants: RemixPropVariant[];
};

/** Batch entry (rev2) — a swap-config group of crop sheets. Identity = `id`
 *  (uuid). Crops carry multi-subject `tags[]`; the legacy `keys[]` lineup is
 *  gone. Was named "mix"; persisted column is still `mixes[]`. */
export interface RemixMix {
  id: string;
  order: number;
  /** Display name e.g. "Batch 1". */
  name: string;
  crop_sheets: RemixCropSheet[];
}

// ── Spread (display-only subset of BaseSpread) ───────────────────────────────
// Drop editor-only fields. We intentionally keep this as a Pick so the existing
// CanvasSpreadView<RemixSpread> generic continues to type-check.

export type RemixSpread = Omit<
  BaseSpread,
  'raw_images' | 'raw_textboxes' | 'manuscript' | 'tiny_sketch_media_url'
>;

export interface RemixIllustration {
  spreads: RemixSpread[];
  sections: Section[];
}

// ── Inject (Phase 3 — client-side finalize) ──────────────────────────────────
// Inject resolves the winning is_final crops, mutates illustration.spreads[]
// .images[] (set final_hires_media_url + collapse illustrations[]), and persists
// the full illustration column in ONE Supabase UPDATE. No background job.
// Spec: api/remix/inject.md (commit 5229b1d — client-side finalize).

/** Result of a successful `injectFinalCrops` call.
 *  - appliedCount  = layers that received a swapped final_hires_media_url
 *  - collapsedCount = layers whose illustrations[] were slimmed to 1 element
 *  - spreadCount   = number of spreads scanned */
export interface InjectResult {
  appliedCount: number;
  collapsedCount: number;
  spreadCount: number;
}

/** Local UI state of the Inject button (held in RemixAccordionItem, not store). */
export type InjectUiState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; appliedCount: number; injectedAt: string }
  | { state: 'error'; message: string };

// ── Remix config (user-driven picks) ─────────────────────────────────────────

/** Per-trait toggle inside a character choice. 5 entries (TRAIT_TYPES), cloned
 *  from the book character's trait gate; order is display-only (keyed by type). */
export interface RemixTraitChoice {
  type: TraitType;
  is_enabled: boolean;
}

export interface RemixCharacterChoice {
  key: string;
  human_id: string | null;
  visual: string | null;
  /** 5 trait toggles; only enabled traits (with a human description) are sent
   *  to the swap endpoint. */
  traits: RemixTraitChoice[];
  /** Result of live base-variant swap (`/api/remix/swap-character-visual`).
   *  Copied into the cloned variant `visual_swap_url` at create time. */
  base_image_url: string | null;
  is_enabled: boolean;
}

export interface RemixPropChoice {
  key: string;
  prop_id: string | null;
  visual: string | null;
  is_enabled: boolean;
}

/** Voice collection entry — replaces the legacy singular `narrator` + per-character
 *  `voice_id`. key = 'narrator' (literal) | <character.key>. `name` is materialized
 *  from book.voices[] for fallback render; narrator name is user-editable. */
export interface RemixVoiceChoice {
  key: string;
  name: string;
  voice_id: string | null;
  is_enabled: boolean;
}

export interface RemixLanguageChoice {
  name: string;
  code: RemixLanguageCode | string;
  is_enabled: boolean;
}

export interface RemixConfig {
  characters: RemixCharacterChoice[];
  props: RemixPropChoice[];
  voices: RemixVoiceChoice[];
  languages: RemixLanguageChoice[];
}

// ── Modal-local option / preview types (ephemeral — never persisted) ─────────

/** Per-character live-swap preview state held by the modal (not in RemixConfig). */
export interface SwapPreviewState {
  status: 'idle' | 'loading' | 'done' | 'error';
  beforeUrl: string | null;
  afterUrl: string | null;
  errorMessage?: string;
}

export interface HumanOption {
  id: string;
  name: string;
  thumbnail_url?: string;
}

export interface VisualOption {
  value: string;
  label: string;
  thumbnail_url?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  language?: string;
}

/** Default name for a freshly created remix (create-only modal). */
export const REMIX_NAME_DEFAULT = 'New Remix';

// ── Top-level DB row ─────────────────────────────────────────────────────────

export interface Remix {
  id: string;
  snapshot_id: string;
  name: string;
  remix_config: RemixConfig;
  illustration: RemixIllustration;
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  created_at: string;
  updated_at: string;
}

/** Shape used when INSERTing into Supabase (omits server-managed cols). */
export type InsertableRemixRow = Omit<Remix, 'id' | 'created_at' | 'updated_at'>;

/** Shape returned by Supabase select — id/created_at/updated_at + JSONB columns. */
export interface RemixRow {
  id: string;
  snapshot_id: string;
  name: string;
  remix_config: RemixConfig;
  illustration: IllustrationData; // raw JSONB — caller narrows to RemixIllustration on read
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  created_at: string;
  updated_at: string;
}

// ── Remix Job (DB row parity — Phase 2 background_jobs) ─────────────────────
// Aligned 1:1 với public.background_jobs DB enum (queued|running|completed|
// failed|cancelled). `partial` is a derived UI state (status='completed' AND
// result.errors.length > 0). Spec: ai-storybook-design/component/stores/remix-store.md §2.

// `character_swap` (renamed from `entity_swap`, design 2026-05-22) = bulk swap
// of every crop sheet × variant of ONE character via the character-swap job.
// Prop/mix swap will ship later under distinct phases (`prop_swap`/`mix_swap`)
// — keep the type→phase map (map-background-job-row.ts) extensible, not hardcoded.
// rev2: `remix_mix_swap` = batch-level swap (api/jobs/05). `character_swap` kept
// until Phase 10 prunes its callers (keep union wide to reduce churn mid-chain).
// NOTE: `image` phase removed (2026-05-30) — Inject is now a synchronous
// client-side finalize (no background job). See InjectResult / injectFinalCrops.
export type RemixJobPhase = 'audio' | 'character_swap' | 'remix_mix_swap';

export type RemixJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RemixJobError {
  // Audio: 'narrate-script' | 'combine-audio-chunks' | 'persist' | 'internal'
  // Character swap (api/jobs/04): 'compose' | 'swap' | 'persist' | 'resolve' | 'internal'
  stage: string;
  spreadId?: string;
  textboxId?: string;
  languageKey?: string;
  chunkIndex?: number;
  entityKey?: string;
  message: string;
}

export type RemixJobStepDetail =
  | 'pending'
  | 'running'
  | 'done'
  | { state: 'failed'; stage: string; message: string; failed_textbox_ids?: string[] };

export interface RemixJobResult {
  errors: RemixJobError[];
  updated_spreads?: number;
  failed_spreads?: number;
  total_chunks_regenerated?: number;
  total_textboxes_recombined?: number;
  // Character swap (api/jobs/04 §Result) — per-sheet counters.
  character_key?: string;
  swapped_sheets?: number;
  skipped_sheets?: number;
  failed_sheets?: number;
  variants_processed?: number;
  [k: string]: unknown;
}

export interface RemixJob {
  id: string;
  remixId: string;
  phase: RemixJobPhase;
  triggeredBy: 'auto-create' | 'user';
  status: RemixJobStatus;
  /** Set for `character_swap` jobs only — mirrors `params.character_key`. Lets
   *  selectors match the running swap to its character row. Undefined for
   *  audio/image phases. */
  characterKey?: string;
  /** Set for `remix_mix_swap` jobs only — mirrors `params.batch_id`. Lets
   *  selectors match the running swap to its batch. Undefined otherwise. */
  batchId?: string;
  currentStep: number;
  totalSteps: number;
  stepDetails?: { spreads: Record<string, RemixJobStepDetail> };
  result?: RemixJobResult;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** 3-shape result returned by startAudioJob/startMixSwap.
 *  Spec: api/jobs/01 §Result + api/jobs/05 §Result. `characterKey` is set only
 *  on cross-type dedup against an ALREADY-active character-swap job (may differ
 *  from the requested key — see api/jobs/05 §cross-type dedup). */
export type EnqueueRemixJobOutcome =
  | { kind: 'enqueued'; jobId: string; totalSteps: number; chunksToRegen?: number; textboxesToRecombine?: number; characterKey?: string }
  | { kind: 'deduped';  jobId: string; status: 'queued' | 'running'; characterKey?: string }
  | { kind: 'skipped';  reason: string };

/** 7-state discriminated union driving AudioJobBadge component render. */
export type AudioJobBadgeState =
  | { kind: 'hidden' }
  | { kind: 'queued';     jobId: string }
  | { kind: 'running';    jobId: string; current: number; total: number }
  | { kind: 'cancelling'; jobId: string }
  | { kind: 'cancelled';  jobId: string; completedAt: string }
  | { kind: 'partial';    jobId: string; errorCount: number; completedAt: string }
  | { kind: 'failed';     jobId: string; message: string };

/** Raw shape of public.background_jobs row returned by Supabase select + realtime payload. */
export interface BackgroundJobRow {
  id: string;
  type: 'remix_audio_swap' | 'remix_image_swap' | 'remix_character_swap' | 'remix_mix_swap' | string;
  user_id: string;
  book_id: string | null;
  status: RemixJobStatus;
  cancel_requested: boolean;
  total_steps: number;
  current_step: number;
  step_details: RemixJob['stepDetails'];
  params: {
    remix_id: string;
    triggered_by?: 'auto-create' | 'user';
    /** Present on `remix_character_swap` rows — the swapped character key. */
    character_key?: string;
    /** Present on `remix_mix_swap` rows — the swapped batch id (api/jobs/05). */
    batch_id?: string;
    [k: string]: unknown;
  };
  result: RemixJobResult | null;
  created_at: string;
  updated_at: string;
}

/** Hardcoded chunk-concurrency cap sent to backend on every enqueue.
 *  Guards ElevenLabs 5 req/s; backend may clamp further. */
export const CLIENT_AUDIO_CHUNK_CAP = 2 as const;

/** Discriminated union of remote events applied by `applyServerEvent`. */
export type RemixServerEvent =
  | { type: 'created'; remix: Remix }
  | { type: 'updated'; id: string; patch: Partial<Remix> }
  | { type: 'deleted'; id: string }
  | { type: 'job_upsert'; row: BackgroundJobRow }
  | { type: 'job_delete'; id: string };

// ── Filter state (sidebar popover) ───────────────────────────────────────────
// Empty arrays = no filter (all checked semantic — see Phase 06).

export interface RemixFilterState {
  characterKeys: string[];
  propKeys: string[];
}

// ── Sidebar callback target ──────────────────────────────────────────────────

export interface SwapCropSheetTarget {
  remixId: string;
  type: 'character' | 'prop' | 'mix';
  key: string;
}


// === rev2 projections (Variants / Batches tabs) ==============================

/** A single variant node for the Variants tab. `visualSwapUrl` is the persisted
 *  per-variant swap result (Generate action); `isBase` marks the type=0 variant. */
export interface RemixVariantNode {
  variantKey: string;
  name: string;
  illustrationUrl: string | null;
  visualSwapUrl: string | null;
  isBase: boolean;
}

/** A character/prop entity projection for the Variants tab. */
export interface RemixVariantEntity {
  type: 'character' | 'prop';
  key: string;
  name: string;
  variants: RemixVariantNode[];
}

/** Batch-level swap task progress (rev2 — mirrors SwapTaskStatus but batch-scoped). */
export type BatchSwapTaskStatus =
  | { state: 'idle' }
  | { state: 'running'; current: number; total: number }
  | { state: 'error'; message: string; failedSheets: number };

/** Batches-tab projection of one `remix.mixes[]` entry + its derived swap task. */
export interface RemixBatch {
  id: string;
  order: number;
  name: string;
  crop_sheets: RemixCropSheet[];
  swapTask: BatchSwapTaskStatus;
}

/** Variant-qualified lineup tokens of a batch — `${object_key}/${variant_key}`
 *  per distinct subject tag across all sheets. Replaces the legacy `mixes[].keys[]`
 *  identity (now derived from crop tags, not persisted). */
export function batchLineupTokens(batch: RemixBatch): string[] {
  const tokens = new Set<string>();
  for (const sheet of batch.crop_sheets) {
    for (const crop of sheet.crops) {
      for (const tag of crop.tags) {
        tokens.add(`${tag.object_key}/${tag.variant_key}`);
      }
    }
  }
  return [...tokens];
}

// === Entity swap (modal-driven, per-key) — SwapCropSheetModal ================
// Swap runs over every crop sheet of one entity key. `current`/`total` track
// loop progress; `failedSheets` counts sheets that errored in a partial run.

export type SwapTaskStatus =
  | { state: 'idle' }
  | { state: 'running'; current: number; total: number }
  | { state: 'error'; message: string; failedSheets: number };

/** Reference image for refine — canonical shape shared with
 *  `useReferenceImagePicker` (which re-exports this type). */
export interface ReferenceImage {
  label: string;
  base64Data: string;
  mimeType: string;
}

/** Swap model / upscale params collected by the right-sidebar.
 *  v1: collect-only — not yet wired to any API (see plan §unresolved #2). */
export interface SwapModelParams {
  swapModel: string;
  upscaleModel: string;
  scale: number; // 2..10
}

/** Args for the batch-level mix-swap enqueue (rev2 — api/jobs/05). `params`
 *  (swap model) is v1 collect-only — NOT forwarded to the API yet. */
export interface StartMixSwapParams {
  remixId: string;
  batchId: string;
  /** v1 collect-only — not forwarded to the swap API yet. */
  params: SwapModelParams;
  /** When true (default), clear + re-swap every sheet of the batch; false is
   *  idempotent — backend skips sheets that already carry a swap (api/jobs/05). */
  forceResweep?: boolean;
}

// ── Text Swap Engine (Phase 1) ───────────────────────────────────────────────
// Sync client-side swap of `character.name` → `humans.display_name[lang]` over
// remix illustration textbox text + audio chunk scripts. Pure function, no I/O.
// Spec: ai-storybook-design/component/stores/remix-store.md §10.

/** Warning kinds emitted during swap-map build / apply. 5 kinds —
 *  `short_source_name` dropped per Validation Session 1 (CJK 2-char names valid). */
export type TextSwapWarningKind =
  | 'no_human_picked'
  | 'stale_human_fk'
  | 'missing_display_name'
  | 'no_op_swap'
  | 'empty_source_name';

export interface TextSwapWarning {
  kind: TextSwapWarningKind;
  characterKey?: string;
  language?: string;
  source?: string;
  target?: string;
}

export interface TextSwapInput {
  illustration: RemixIllustration;
  remixCharacters: RemixCharacter[];
  configCharacters: RemixCharacterChoice[];
  enabledLanguages: string[];
  humans: Record<string, Human>;
}

export interface TextSwapResult {
  illustration: RemixIllustration;
  warnings: TextSwapWarning[];
  matchCount: number;
  chunksMarkedUnsynced: number;
}
