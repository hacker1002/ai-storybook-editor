// jobs-api.ts — Thin wrappers over callImageApi for background job endpoints.
// Endpoints: /api/jobs/remix/{id}/audio-swap, /api/jobs/remix/{id}/mix-swap,
//            /api/jobs/{id}/cancel.
// NOTE: image-swap enqueue removed (2026-05-30) — Inject is now a synchronous
// client-side finalize (see remix-store injectFinalCrops).
// Auth: X-API-Key (service-to-service) + Bearer JWT (RLS user_id). Both are
// always sent by callImageApi when a Supabase session is active.
// Spec: ai-storybook-design/api/jobs/01-enqueue-remix-audio-swap.md
//       ai-storybook-design/api/jobs/04-enqueue-remix-character-swap.md
//       ai-storybook-design/api/jobs/03-cancel-job.md

import { callImageApi, type ImageApiFailure } from './image-api-client';
import { DETECT_JOB_CONFIG, type DetectPlane } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'JobsApi');

// ── Response shapes (snake_case from FastAPI) ────────────────────────────────

export interface EnqueueAudioSwapEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'remix_audio_swap';
  remix_id: string;
  total_steps: number;
  chunks_to_regen: number;
  textboxes_to_recombine: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueAudioSwapSkippedData {
  skipped: true;
  reason: string;
  chunks_to_regen?: number;
}

export interface EnqueueAudioSwapDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'remix_audio_swap';
  remix_id: string;
  deduped: true;
}

export type EnqueueAudioSwapData =
  | EnqueueAudioSwapEnqueuedData
  | EnqueueAudioSwapSkippedData
  | EnqueueAudioSwapDedupedData;

export interface EnqueueJobResponse<T> {
  success: true;
  data: T;
}

export interface CancelJobData {
  job_id: string;
  cancel_requested: boolean;
  current_status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface EnqueueAudioSwapParams {
  triggered_by: 'auto-create' | 'user';
  max_concurrent_chunks_per_textbox: number;
}

// ── Stage jobs (api/jobs/05 mix-swap + 09 rmbg + 10 upscale — batch-level) ───
// ⚡2026-06-12 — one generic wrapper, parameterized by the endpoint segment
// (replaces the mix-only enqueueRemixMixSwap; validation S1 no alias). The 3
// responses share the fields the FE consumes; job-specific extras (e.g. job
// 05's target_count) ride in the index signature.

/** Per-model parameters forwarded to a stage/sprite job (⚡2026-06-13 — wired
 *  from the right-sidebar params via `buildModelParams`). `model` = the picked
 *  model id (allowlist UI); `params` = optional knobs the backend
 *  allowlists/clamps/maps per model (temperature for swap, noise for upscale).
 *  Backend drops keys a model doesn't support (defense). */
export interface ModelParamsBody {
  model: string;
  params?: { temperature?: number; noise?: number };
}

export interface EnqueueStageJobBody {
  batch_id: string;
  force_resweep?: boolean;
  /** ⚡2026-06-13 WIRED — per-model params (model + temperature/noise). */
  model_params?: ModelParamsBody;
}

export type StageJobEndpointSegment = 'mix-swap' | 'rmbg' | 'upscale';

export interface EnqueueStageJobEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'remix_mix_swap' | 'remix_rmbg' | 'remix_upscale';
  remix_id: string;
  batch_id: string;
  total_steps: number;
  sheets_to_process: number;
  estimated_duration_sec: number;
  skipped?: false;
  deduped?: false;
  [k: string]: unknown;
}

export interface EnqueueStageJobSkippedData {
  skipped: true;
  /** Opaque per-job reason — job 05: 'all_sheets_already_swapped' |
   *  'no_crop_sheets'; jobs 09/10: 'all_sheets_already_done' | … . FE only
   *  displays it. */
  reason: string;
  sheets_to_process: 0;
}

export interface EnqueueStageJobDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'remix_mix_swap' | 'remix_rmbg' | 'remix_upscale';
  remix_id: string;
  active_swap_key: string;
  deduped: true;
}

export type EnqueueStageJobData =
  | EnqueueStageJobEnqueuedData
  | EnqueueStageJobSkippedData
  | EnqueueStageJobDedupedData;

// ── Sprite swap (api/jobs/02 — sprite-level swap, Variants tab) ──────────────

export interface EnqueueSpriteSwapBody {
  sprite_id: string;
  force_resweep?: boolean;
  /** ⚡2026-06-13 WIRED — per-model params (swap model + temperature). */
  model_params?: ModelParamsBody;
}

export interface EnqueueSpriteSwapEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'remix_sprite_swap';
  remix_id: string;
  sprite_id: string;
  object_count: number;
  total_steps: number;
  sheets_to_process: number;
  estimated_duration_sec: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueSpriteSwapSkippedData {
  skipped: true;
  reason: 'all_sheets_already_swapped' | 'no_crop_sheets' | string;
  sheets_to_process: 0;
}

export interface EnqueueSpriteSwapDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'remix_sprite_swap';
  remix_id: string;
  /** Sprite-swap dedup key = sprite_id (INDEPENDENT of mix-swap — disjoint). */
  active_swap_key: string;
  deduped: true;
}

export type EnqueueSpriteSwapData =
  | EnqueueSpriteSwapEnqueuedData
  | EnqueueSpriteSwapSkippedData
  | EnqueueSpriteSwapDedupedData;

// ── Detect swap defects (api/jobs/11 sprite + 12 mix — generic Check) ─────────
// Mirror swap: enqueue a background job that loops every swapped sheet and
// returns `defectsBySheet` via `background_jobs.result`. Advisory/ephemeral.
// ⚡2026-06-27 — ONE generic wrapper parameterized by `plane` (sprite/mix); the
// scope key + endpoint + job-type are resolved from `DETECT_JOB_CONFIG`.

export interface EnqueueDetectBody {
  /** Scope to inspect — sprite_id (sprite plane) | batch_id (mix plane). The
   *  wrapper sets the correct body field from `DETECT_JOB_CONFIG[plane].scopeKey`. */
  scopeId: string;
  force_resweep?: boolean;
  /** Swap intent context the core re-reads (NOT a model dispatch). */
  swap_model?: string;
  swap_temperature?: number;
  focus_objects?: string[];
  severity_threshold?: 'low' | 'medium' | 'high';
  max_defects?: number;
}

/** Detect job-type — 2 separate dedup families (sprite vs mix). */
export type DetectJobType = 'remix_detect_defects' | 'remix_detect_mix_defects';

export interface EnqueueDetectEnqueuedData {
  job_id: string;
  status: 'queued';
  type: DetectJobType;
  remix_id: string;
  /** Exactly one of these is set per plane (sprite_id | batch_id). */
  sprite_id?: string;
  batch_id?: string;
  /** mix-only — # of target objects across the batch (api/jobs/12). */
  target_count?: number;
  total_steps: number;
  sheets_to_process: number;
  estimated_duration_sec?: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueDetectSkippedData {
  skipped: true;
  reason: 'no_swap_result' | 'no_crop_sheets' | string;
  sheets_to_process: 0;
}

export interface EnqueueDetectDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: DetectJobType;
  remix_id: string;
  /** Detect dedup key = scope id (INDEPENDENT of swap + of the other plane). */
  active_swap_key: string;
  deduped: true;
}

export type EnqueueDetectData =
  | EnqueueDetectEnqueuedData
  | EnqueueDetectSkippedData
  | EnqueueDetectDedupedData;

/** Error thrown by enqueue wrappers on non-2xx so callers can branch on the
 *  backend `code` (e.g. MISSING_VARIANT_REFERENCE) — a plain `Error` would lose
 *  it. `code`/`httpStatus` mirror the `ImageApiFailure` fields. */
export class EnqueueJobError extends Error {
  readonly code?: string;
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number, code?: string) {
    super(message);
    this.name = 'EnqueueJobError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ── Wrappers ─────────────────────────────────────────────────────────────────

/** POST /api/jobs/remix/{remixId}/audio-swap */
export async function enqueueAudioSwap(
  remixId: string,
  params: EnqueueAudioSwapParams,
): Promise<EnqueueJobResponse<EnqueueAudioSwapData> | ImageApiFailure> {
  log.info('enqueueAudioSwap', 'request', { remixId, triggered_by: params.triggered_by });
  return callImageApi<EnqueueJobResponse<EnqueueAudioSwapData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/audio-swap`,
    params,
  );
}

/** POST /api/jobs/remix/{remixId}/{mix-swap|rmbg|upscale} (jobs 05/09/10 —
 *  batch-level stage jobs, ⚡2026-06-12 generic). Returns parsed `data` on 2xx
 *  (enqueued/skipped/deduped); throws `EnqueueJobError` (with backend `code`)
 *  on non-2xx so the modal can toast per-code (e.g. 422
 *  MISSING_VARIANT_REFERENCE on mix-swap). */
export async function enqueueRemixStageJob(
  remixId: string,
  endpointSegment: StageJobEndpointSegment,
  body: EnqueueStageJobBody,
): Promise<EnqueueStageJobData> {
  log.info('enqueueRemixStageJob', 'request', {
    remixId,
    endpointSegment,
    forceResweep: body.force_resweep ?? true,
    model: body.model_params?.model,
  });
  const result = await callImageApi<EnqueueJobResponse<EnqueueStageJobData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/${endpointSegment}`,
    {
      batch_id: body.batch_id,
      force_resweep: body.force_resweep ?? true,
      ...(body.model_params ? { model_params: body.model_params } : {}),
    },
  );
  if (!result.success) {
    const failure = result as ImageApiFailure;
    log.error('enqueueRemixStageJob', 'failed', {
      remixId,
      endpointSegment,
      httpStatus: failure.httpStatus,
      errorCode: failure.errorCode,
    });
    throw new EnqueueJobError(failure.error, failure.httpStatus, failure.errorCode);
  }
  return result.data;
}

/** POST /api/jobs/remix/{remixId}/sprite-swap (api/jobs/02 — sprite-level swap).
 *  Returns parsed `data` on 2xx (enqueued/skipped/deduped); throws
 *  `EnqueueJobError` (with backend `code`) on non-2xx so the modal can
 *  distinguish 422 NO_SWAP_OBJECTS / MISSING_OBJECT_CONFIG / 404 SPRITE_NOT_FOUND
 *  from a generic failure. Body carries `sprite_id` + `force_resweep` +
 *  ⚡2026-06-13 `model_params` (swap model + temperature). */
export async function enqueueRemixSpriteSwap(
  remixId: string,
  body: EnqueueSpriteSwapBody,
): Promise<EnqueueSpriteSwapData> {
  log.info('enqueueRemixSpriteSwap', 'request', {
    remixId,
    forceResweep: body.force_resweep ?? true,
    model: body.model_params?.model,
  });
  const result = await callImageApi<EnqueueJobResponse<EnqueueSpriteSwapData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/sprite-swap`,
    {
      sprite_id: body.sprite_id,
      force_resweep: body.force_resweep ?? true,
      ...(body.model_params ? { model_params: body.model_params } : {}),
    },
  );
  if (!result.success) {
    const failure = result as ImageApiFailure;
    log.error('enqueueRemixSpriteSwap', 'failed', {
      remixId,
      httpStatus: failure.httpStatus,
      errorCode: failure.errorCode,
    });
    throw new EnqueueJobError(failure.error, failure.httpStatus, failure.errorCode);
  }
  return result.data;
}

/** POST /api/jobs/remix/{remixId}/{detect-sprite-defects | detect-mix-defects}
 *  (api/jobs/11 sprite | 12 mix — generic Check). The endpoint + scope-key are
 *  resolved from `DETECT_JOB_CONFIG[plane]`. Returns parsed `data` on 2xx
 *  (enqueued/skipped/deduped); throws `EnqueueJobError` (with backend `code` +
 *  `httpStatus`) on non-2xx so the caller can branch — NOTE the dedup
 *  divergence: sprite (11) returns HTTP 200 `{ deduped: true }` while mix (12)
 *  returns HTTP 409 `JOB_ALREADY_ACTIVE`; the store action (`startDetectJob`)
 *  tolerates BOTH. SECURITY: never log defect messages/media. */
export async function enqueueDetectDefects(
  plane: DetectPlane,
  remixId: string,
  body: EnqueueDetectBody,
): Promise<EnqueueDetectData> {
  const cfg = DETECT_JOB_CONFIG[plane];
  log.info('enqueueDetectDefects', 'request', {
    plane,
    remixId,
    endpoint: cfg.endpointSegment,
    forceResweep: body.force_resweep ?? true,
    model: body.swap_model,
  });
  const result = await callImageApi<EnqueueJobResponse<EnqueueDetectData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/${cfg.endpointSegment}`,
    {
      [cfg.scopeKey]: body.scopeId,
      force_resweep: body.force_resweep ?? true,
      ...(body.swap_model ? { swap_model: body.swap_model } : {}),
      ...(body.swap_temperature != null
        ? { swap_temperature: body.swap_temperature }
        : {}),
      ...(body.focus_objects ? { focus_objects: body.focus_objects } : {}),
      ...(body.severity_threshold
        ? { severity_threshold: body.severity_threshold }
        : {}),
      ...(body.max_defects != null ? { max_defects: body.max_defects } : {}),
    },
  );
  if (!result.success) {
    const failure = result as ImageApiFailure;
    log.error('enqueueDetectDefects', 'failed', {
      plane,
      remixId,
      httpStatus: failure.httpStatus,
      errorCode: failure.errorCode,
    });
    throw new EnqueueJobError(failure.error, failure.httpStatus, failure.errorCode);
  }
  return result.data;
}

// ── Export PDF (api/jobs/06 — book + remix route) ────────────────────────────

export interface StartExportPdfOpts {
  dpi?: number;
  color_mode?: 'cmyk' | 'rgb';
}

export interface EnqueueExportPdfEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'export_pdf';
  source: 'book' | 'remix';
  book_id: string;
  remix_id?: string;
  total_steps: number;
  spreads_to_render: number;
  estimated_duration_sec: number;
  estimated_file_size_mb: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueExportPdfSkippedData {
  skipped: true;
  reason: 'no_interior_spreads' | 'snapshot_empty' | string;
  spreads_to_render: 0;
}

export interface EnqueueExportPdfDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'export_pdf';
  source: 'book' | 'remix';
  book_id: string;
  remix_id?: string;
  deduped: true;
}

export type EnqueueExportPdfData =
  | EnqueueExportPdfEnqueuedData
  | EnqueueExportPdfSkippedData
  | EnqueueExportPdfDedupedData;

/** Narrowing guards — `data` is a 3-way union (enqueued | skipped | deduped). */
export function isExportPdfSkipped(
  d: EnqueueExportPdfData,
): d is EnqueueExportPdfSkippedData {
  return (d as EnqueueExportPdfSkippedData).skipped === true;
}

export function isExportPdfDeduped(
  d: EnqueueExportPdfData,
): d is EnqueueExportPdfDedupedData {
  return (d as EnqueueExportPdfDedupedData).deduped === true;
}

/** POST /api/jobs/{bookId}/export-pdf (book source). Path verbatim (FastAPI —
 *  no kebab flatten). v1 callers pass `{ dpi: 300, color_mode: 'cmyk' }`. */
export async function enqueueBookExportPdf(
  bookId: string,
  opts: StartExportPdfOpts = {},
): Promise<EnqueueJobResponse<EnqueueExportPdfData> | ImageApiFailure> {
  log.info('enqueueBookExportPdf', 'request', {
    bookId,
    dpi: opts.dpi,
    colorMode: opts.color_mode,
  });
  return callImageApi<EnqueueJobResponse<EnqueueExportPdfData>>(
    `/api/jobs/${encodeURIComponent(bookId)}/export-pdf`,
    opts,
  );
}

/** POST /api/jobs/remix/{remixId}/export-pdf (remix source). */
export async function enqueueRemixExportPdf(
  remixId: string,
  opts: StartExportPdfOpts = {},
): Promise<EnqueueJobResponse<EnqueueExportPdfData> | ImageApiFailure> {
  log.info('enqueueRemixExportPdf', 'request', {
    remixId,
    dpi: opts.dpi,
    colorMode: opts.color_mode,
  });
  return callImageApi<EnqueueJobResponse<EnqueueExportPdfData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/export-pdf`,
    opts,
  );
}

// ── Render Book Video (api/jobs/07 — book + remix route) ────────────────────

export interface StartRenderVideoOpts {
  edition: 'classic' | 'dynamic';
  language?: string;
  start_spread_id?: string;
}

export interface EnqueueRenderVideoEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'render_book_video';
  source: 'book' | 'remix';
  book_id: string;
  remix_id?: string;
  edition: 'classic' | 'dynamic';
  resolution: 'qhd';
  total_steps: number;
  spreads_in_sequence: number;
  estimated_duration_sec: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueRenderVideoSkippedData {
  skipped: true;
  reason: 'empty_sequence' | 'snapshot_empty' | string;
  spreads_in_sequence: 0;
}

export interface EnqueueRenderVideoDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'render_book_video';
  source: 'book' | 'remix';
  book_id: string;
  remix_id?: string;
  edition: 'classic' | 'dynamic';
  deduped: true;
}

export type EnqueueRenderVideoData =
  | EnqueueRenderVideoEnqueuedData
  | EnqueueRenderVideoSkippedData
  | EnqueueRenderVideoDedupedData;

/** Narrowing guards — 3-way union (enqueued | skipped | deduped). */
export function isRenderVideoSkipped(
  d: EnqueueRenderVideoData,
): d is EnqueueRenderVideoSkippedData {
  return (d as EnqueueRenderVideoSkippedData).skipped === true;
}

export function isRenderVideoDeduped(
  d: EnqueueRenderVideoData,
): d is EnqueueRenderVideoDedupedData {
  return (d as EnqueueRenderVideoDedupedData).deduped === true;
}

/** POST /api/jobs/{bookId}/render-book-video (book source). v1 fixed QHD master;
 *  body carries `edition` (required) + optional `language` / `start_spread_id`. */
export async function enqueueBookRenderVideo(
  bookId: string,
  opts: StartRenderVideoOpts,
): Promise<EnqueueJobResponse<EnqueueRenderVideoData> | ImageApiFailure> {
  log.info('enqueueBookRenderVideo', 'request', { bookId, edition: opts.edition });
  return callImageApi<EnqueueJobResponse<EnqueueRenderVideoData>>(
    `/api/jobs/${encodeURIComponent(bookId)}/render-book-video`,
    opts,
  );
}

/** POST /api/jobs/remix/{remixId}/render-book-video (remix source). */
export async function enqueueRemixRenderVideo(
  remixId: string,
  opts: StartRenderVideoOpts,
): Promise<EnqueueJobResponse<EnqueueRenderVideoData> | ImageApiFailure> {
  log.info('enqueueRemixRenderVideo', 'request', { remixId, edition: opts.edition });
  return callImageApi<EnqueueJobResponse<EnqueueRenderVideoData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/render-book-video`,
    opts,
  );
}

/** POST /api/jobs/{jobId}/cancel */
export async function cancelJobRemote(
  jobId: string,
): Promise<EnqueueJobResponse<CancelJobData> | ImageApiFailure> {
  log.info('cancelJobRemote', 'request', { jobId });
  return callImageApi<EnqueueJobResponse<CancelJobData>>(
    `/api/jobs/${encodeURIComponent(jobId)}/cancel`,
    {},
  );
}
