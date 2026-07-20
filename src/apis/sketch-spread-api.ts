// sketch-spread-api.ts — client for the sketch spread-image generate endpoint.
// The endpoint is PER-PAGE: one call generates ONE page (`page`). The backend reads the
// spread's art_direction, the already-generated LEFT page (for 'right'), and prior spreads
// straight from the persisted snapshot — so the body carries the identifiers plus `page`
// (+ optional `targetRatio`), no variants[], no modelParams (v1).
// Mirrors illustration-api.ts convention: flat apis/*.ts + callImageApi<R> (never throws).

import { callImageApi, type ImageApiFailure } from './image-api-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'SketchSpreadApi');

const GENERATE_SPREAD_IMAGE_PATH = '/api/sketch/generate-spread-image';

export type SketchGeneratePage = 'left' | 'right' | 'full';

export interface GenerateSpreadImageParams {
  snapshotId: string;
  sketchSpreadId: string;
  /** UUID of `art_styles.id` (= `book.artstyle_id`), NOT the description. Backend fetches the row. */
  artStyleId: string;
  /** Which page of the spread to generate — backend generates ONE page per call. */
  page: SketchGeneratePage;
  /** Optional "W:H" override; omit to let the backend pick its per-page default. */
  targetRatio?: string;
  // modelParams omitted in v1 (KISS).
}

export interface GenerateSpreadImageResult {
  success: boolean;
  data?: {
    imageUrl: string;
    storagePath: string;
    page: SketchGeneratePage;
    targetRatio: string;
    genAspectRatio: string;
    /** 'both' = full page (trim chia đôi 2 cạnh, gáy giữ tâm); 'left'/'right' = mép ngoài của trang đơn. */
    trimSide: 'left' | 'right' | 'bottom' | 'both' | null;
    /** TỔNG fraction đã cắt (0 nếu khớp enum). */
    trimFraction: number;
  };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number; model?: string };
}

/**
 * Generate the backdrop image for ONE page of a sketch spread. The backend resolves the page's
 * art_direction, the already-generated left page (when page='right'), and previous spreads from
 * the persisted snapshot (why the caller flushes before each call). Never throws — returns
 * GenerateSpreadImageResult | ImageApiFailure (errorCode preserved for classification).
 */
export async function callGenerateSketchSpread(
  params: GenerateSpreadImageParams,
): Promise<GenerateSpreadImageResult | ImageApiFailure> {
  log.info('callGenerateSketchSpread', 'start', {
    sketchSpreadId: params.sketchSpreadId,
    page: params.page,
  });

  const body = {
    snapshotId: params.snapshotId,
    sketchSpreadId: params.sketchSpreadId,
    artStyleId: params.artStyleId,
    page: params.page,
    ...(params.targetRatio ? { targetRatio: params.targetRatio } : {}),
  };

  return callImageApi<GenerateSpreadImageResult>(GENERATE_SPREAD_IMAGE_PATH, body);
}
