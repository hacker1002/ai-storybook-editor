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
