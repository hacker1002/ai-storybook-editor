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

// ── Mix swap (api/jobs/05 — batch-level swap) ────────────────────────────────

export interface EnqueueMixSwapBody {
  batch_id: string;
  force_resweep?: boolean;
}

export interface EnqueueMixSwapEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'remix_mix_swap';
  remix_id: string;
  batch_id: string;
  target_count: number;
  unchanged_count: number;
  total_steps: number;
  sheets_to_process: number;
  estimated_duration_sec: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueMixSwapSkippedData {
  skipped: true;
  reason: 'all_sheets_already_swapped' | 'no_crop_sheets' | string;
  sheets_to_process: 0;
}

export interface EnqueueMixSwapDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  /** Active job may be a char-swap (cross-type dedup — strictly 1 swap/remix). */
  type: 'remix_mix_swap' | 'remix_character_swap';
  remix_id: string;
  active_swap_key: string;
  deduped: true;
}

export type EnqueueMixSwapData =
  | EnqueueMixSwapEnqueuedData
  | EnqueueMixSwapSkippedData
  | EnqueueMixSwapDedupedData;

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

/** POST /api/jobs/remix/{remixId}/mix-swap (api/jobs/05 — batch-level swap).
 *  Returns parsed `data` on 2xx (enqueued/skipped/deduped); throws
 *  `EnqueueJobError` (with backend `code`) on non-2xx so the modal can
 *  distinguish 422 MISSING_VARIANT_REFERENCE / TOO_MANY_SWAP_TARGETS /
 *  NO_SWAP_TARGETS from a generic failure. */
export async function enqueueRemixMixSwap(
  remixId: string,
  body: EnqueueMixSwapBody,
): Promise<EnqueueMixSwapData> {
  log.info('enqueueRemixMixSwap', 'request', {
    remixId,
    forceResweep: body.force_resweep ?? true,
  });
  const result = await callImageApi<EnqueueJobResponse<EnqueueMixSwapData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/mix-swap`,
    { batch_id: body.batch_id, force_resweep: body.force_resweep ?? true },
  );
  if (!result.success) {
    const failure = result as ImageApiFailure;
    log.error('enqueueRemixMixSwap', 'failed', {
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
