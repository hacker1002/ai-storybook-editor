// sketch-spread-api.ts — client for the single sketch spread-image generate endpoint.
// Unlike sketch-sheet-api.ts (3 per-kind routes), there is ONE endpoint: the backend reads the
// spread's art_direction + prior spreads straight from the snapshot, so the body carries only
// the identifiers ({ snapshotId, sketchSpreadId, artStyleId }) — no variants[], no modelParams (v1).
// Mirrors illustration-api.ts convention: flat apis/*.ts + callImageApi<R> (never throws).

import { callImageApi, type ImageApiFailure } from './image-api-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'SketchSpreadApi');

const GENERATE_SPREAD_IMAGE_PATH = '/api/sketch/generate-spread-image';

export interface GenerateSpreadImageParams {
  snapshotId: string;
  sketchSpreadId: string;
  /** UUID of `art_styles.id` (= `book.artstyle_id`), NOT the description. Backend fetches the row. */
  artStyleId: string;
  // modelParams omitted in v1 (KISS, parity with sketch-sheet-api).
}

export interface GenerateSpreadImageResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string; pageLayout: 'full' | 'left-right' };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number; model?: string };
}

/**
 * Generate the backdrop image for ONE sketch spread. The backend resolves the spread's
 * art_direction and the already-generated previous spreads from the persisted snapshot
 * (why the caller flushes before each call). Never throws — returns
 * GenerateSpreadImageResult | ImageApiFailure (errorCode preserved for classification).
 */
export async function callGenerateSketchSpread(
  params: GenerateSpreadImageParams,
): Promise<GenerateSpreadImageResult | ImageApiFailure> {
  log.info('callGenerateSketchSpread', 'start', { sketchSpreadId: params.sketchSpreadId });

  const body = {
    snapshotId: params.snapshotId,
    sketchSpreadId: params.sketchSpreadId,
    artStyleId: params.artStyleId,
  };

  return callImageApi<GenerateSpreadImageResult>(GENERATE_SPREAD_IMAGE_PATH, body);
}
