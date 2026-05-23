// remix.ts — Domain types for Remix feature (DB row + ephemeral inject job state)
// DB row JSONB structure: snapshot illustration/characters/props snapshot + remix_config + mixes.

import type { BaseSpread } from './spread-types';
import type { IllustrationData, Section } from './illustration-types';
import type { Character, CharacterVariant } from './character-types';
import type { Prop, PropVariant, Crop } from './prop-types';
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

export interface SwapResult {
  media_url: string;
  created_time: string;
  is_selected: boolean;
}

/** Re-export of crop entry shape from prop-types for consumer convenience. */
export type RemixCrop = Crop;

export interface RemixCropSheet {
  title: string;
  /** Sheet frame size (px) — computed by crop-sheet-layout-engine. Additive
   *  JSONB field (DB-CHANGELOG 2026-05-19), no migration needed. */
  sheet_geometry: { width: number; height: number };
  /** @deprecated build API removed (2026-05-19) — usually empty ''. Kept for
   *  backward-compat; client now composes the sheet from crops + sheet_geometry. */
  image_url: string;
  swap_results: SwapResult[];
  crops: Crop[];
  /** Self-describing variant scope (DB-CHANGELOG 2026-05-20). `null` cho mix
   *  entity. Engine dual-writes `crops[].variant = sheet.variant_key` for
   *  legacy readers. */
  variant_key: string | null;
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

/** Mix entry — auto-generated from multi-subject layer tags during clone. */
export interface RemixMix {
  order: number;
  /** Composed display name e.g. "Elara & Magic Sword" (preserves tag order, not sorted). */
  name: string;
  /** Variant-qualified lineup of the full enabled cast, one token per entity:
   *  `${objectKey}/${variantKey}` (or bare `${objectKey}` when the entity has no
   *  variant). objectKey is a soft ref to remix.characters[].key | remix.props[].key.
   *  Identity = canonicalMixKey(keys) — variant tokens make A/a1 vs A/a2 distinct. */
  keys: string[];
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
export type RemixJobPhase = 'audio' | 'image' | 'character_swap';

export type RemixJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RemixJobError {
  // Audio: 'narrate-script' | 'combine-audio-chunks' | 'persist' | 'internal'
  // Image (Phase 3): 'crop-swap' | 'crop-rasterize' | 'persist' | 'internal'
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
  currentStep: number;
  totalSteps: number;
  stepDetails?: { spreads: Record<string, RemixJobStepDetail> };
  result?: RemixJobResult;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** 3-shape result returned by startAudioJob/startImageJob/startEntitySwap.
 *  Spec: api/jobs/01 §Result + api/jobs/04 §Result. `characterKey` is set only
 *  by the character-swap enqueue path; on `deduped` it is the character of the
 *  ALREADY-active job (may differ from the requested key — see api/jobs/04). */
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
  type: 'remix_audio_swap' | 'remix_image_swap' | 'remix_character_swap' | string;
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

// ── Canonical mix key ────────────────────────────────────────────────────────
/** Stable identity for a mix — sorted keys joined by '-'. Single source of
 *  truth used for clone-builder dedupe, SwapCropSheetTarget.key, crop-sheet
 *  patch matching, and useRemixEntity resolution. Sorted → stable under
 *  keys[] reorder. */
export function canonicalMixKey(keys: string[]): string {
  return keys.slice().sort().join('-');
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

/** Variant group projection — bucket of crop_sheets[] indices that share a
 *  `variant_key`. Ordering follows raw `variants[]` (designer-defined).
 *  Only populated for character/prop entities; mix entity always `[]`. */
export interface RemixVariantGroup {
  variantKey: string;
  name: string;
  /** Index vào RemixEntityRef.crop_sheets[] theo thứ tự xuất hiện. */
  sheetIndices: number[];
  /** Raw `variants[].visual_swap_url` of this variant — the per-variant identity
   *  anchor the character-swap job references. `null` until the user Generates a
   *  swapped visual. Drives the `[⇄]` precondition (every in-scope variant must
   *  be non-null) — see api/jobs/04 §MISSING_VARIANT_REFERENCE. */
  visualSwapUrl: string | null;
}

/** Normalized projection of a single entity (character | prop | mix) for the
 *  swap modal. */
export interface RemixEntityRef {
  type: 'character' | 'prop' | 'mix';
  /** character/prop: native key; mix: canonicalMixKey(keys). */
  key: string;
  name: string;
  crop_sheets: RemixCropSheet[];
  /** Variant grouping projection — filter "≥1 sheet" (char/prop only; mix=[]).
   *  VariantsVisualModal đọc field này (validation session 1: không thêm
   *  rawVariants — modal chỉ show variants có ≥1 sheet). Populated by
   *  `buildVariantGroups` in the selector layer. */
  variants: RemixVariantGroup[];
}

/** Swap model / upscale params collected by the right-sidebar.
 *  v1: collect-only — not yet wired to any API (see plan §unresolved #2). */
export interface SwapModelParams {
  swapModel: string;
  upscaleModel: string;
  scale: number; // 2..10
}

export interface StartEntitySwapParams {
  remixId: string;
  type: 'character' | 'prop' | 'mix';
  /** character/prop: native key; mix: canonicalMixKey(keys). */
  key: string;
  /** v1 collect-only — not forwarded to the swap API yet. */
  params: SwapModelParams;
  /** When true, clear + re-swap every sheet; false (default) is idempotent —
   *  backend skips sheets that already carry an `is_selected` swap (api/jobs/04). */
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
