// remix-api.ts — Thin wrappers over callImageApi for synchronous remix-domain
// endpoints. Endpoint: POST /api/remix/build-crop-sheets (Phase 1.5 — builds
// crop sheets for a freshly created remix). Synchronous, NO background_jobs row.
// Auth: X-API-Key (service-to-service) + Bearer JWT — both sent by callImageApi.
// Spec: ai-storybook-design/api/remix/01-build-crop-sheets.md

import { callImageApi, type ImageApiFailure } from './image-api-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'RemixApi');

// ── Response shapes (snake_case from FastAPI) ────────────────────────────────

export interface BuildRemixCropSheetsGroup {
  group_type: 'character' | 'prop' | 'mix';
  keys: string[];
  status: 'success' | 'empty' | 'failed';
  sheet_count: number;
  crop_count: number;
  skipped_layers: number;
  error?: { code: string; message: string };
}

export interface BuildRemixCropSheetsSummary {
  total_groups: number;
  succeeded: number;
  empty: number;
  failed: number;
  total_sheets: number;
  total_crops: number;
  deleted_mixes: number;
}

/** HTTP 200 body for both full-success and partial. `success` mirrors
 *  `summary.failed === 0`; callers MUST discriminate partial from transport
 *  failure via the `data` field, not `success` (ImageApiFailure also has
 *  `success: false`). */
export interface BuildRemixCropSheetsResult {
  success: boolean;
  error?: string;
  data: {
    remix_id: string;
    groups: BuildRemixCropSheetsGroup[];
    summary: BuildRemixCropSheetsSummary;
  };
  meta: { processingTime: number };
}

// ── Wrappers ─────────────────────────────────────────────────────────────────

/** POST /api/remix/build-crop-sheets — path preserved verbatim (remix domain
 *  uses FastAPI route paths un-flattened). 4xx/5xx pre-flight errors surface as
 *  ImageApiFailure; partial builds return HTTP 200 with summary.failed > 0. */
export async function buildRemixCropSheets(
  remixId: string,
  characterKeys: string[],
  propKeys: string[],
): Promise<BuildRemixCropSheetsResult | ImageApiFailure> {
  log.info('buildRemixCropSheets', 'request', {
    remixId,
    charCount: characterKeys.length,
    propCount: propKeys.length,
  });
  return callImageApi<BuildRemixCropSheetsResult>('/api/remix/build-crop-sheets', {
    remix_id: remixId,
    character_keys: characterKeys,
    prop_keys: propKeys,
  });
}
