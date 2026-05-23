// jobs-api.ts — Thin wrappers over callImageApi for background job endpoints.
// Endpoints: /api/jobs/remix/{id}/audio-swap, /api/jobs/remix/{id}/image-swap,
//            /api/jobs/remix/{id}/character-swap, /api/jobs/{id}/cancel.
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

// ── Character swap (api/jobs/04) ─────────────────────────────────────────────

export interface EnqueueCharacterSwapBody {
  character_key: string;
  force_resweep?: boolean;
}

export interface EnqueueCharacterSwapEnqueuedData {
  job_id: string;
  status: 'queued';
  type: 'remix_character_swap';
  remix_id: string;
  character_key: string;
  total_steps: number;
  sheets_to_process: number;
  variants_in_scope: number;
  estimated_duration_sec: number;
  skipped?: false;
  deduped?: false;
}

export interface EnqueueCharacterSwapSkippedData {
  skipped: true;
  reason: 'all_sheets_already_swapped' | 'no_crop_sheets' | string;
  sheets_to_process: 0;
}

export interface EnqueueCharacterSwapDedupedData {
  job_id: string;
  status: 'queued' | 'running';
  type: 'remix_character_swap';
  remix_id: string;
  /** Character of the ALREADY-active job — may differ from the requested key. */
  character_key: string;
  deduped: true;
}

export type EnqueueCharacterSwapData =
  | EnqueueCharacterSwapEnqueuedData
  | EnqueueCharacterSwapSkippedData
  | EnqueueCharacterSwapDedupedData;

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

/** POST /api/jobs/remix/{remixId}/image-swap (Phase 3 — UI gated but endpoint live) */
export async function enqueueImageSwap(
  remixId: string,
): Promise<EnqueueJobResponse<EnqueueAudioSwapData> | ImageApiFailure> {
  log.info('enqueueImageSwap', 'request', { remixId });
  return callImageApi<EnqueueJobResponse<EnqueueAudioSwapData>>(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/image-swap`,
    {},
  );
}

/** POST /api/jobs/remix/{remixId}/character-swap (api/jobs/04).
 *  Returns parsed `data` on 2xx; throws `EnqueueJobError` (with backend `code`)
 *  on non-2xx so the modal can distinguish MISSING_VARIANT_REFERENCE from a
 *  generic failure. */
export async function enqueueCharacterSwap(
  remixId: string,
  body: EnqueueCharacterSwapBody,
): Promise<EnqueueCharacterSwapData> {
  log.info('enqueueCharacterSwap', 'request', {
    remixId,
    forceResweep: body.force_resweep ?? false,
  });
  const result = await callImageApi<
    EnqueueJobResponse<EnqueueCharacterSwapData>
  >(
    `/api/jobs/remix/${encodeURIComponent(remixId)}/character-swap`,
    { character_key: body.character_key, force_resweep: body.force_resweep ?? false },
  );
  if (!result.success) {
    const failure = result as ImageApiFailure;
    log.error('enqueueCharacterSwap', 'failed', {
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
