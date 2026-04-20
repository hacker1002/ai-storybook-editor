import { callEdgeFunction } from './edge-function-client';
import { callImageApi } from './image-api-client';
import { createLogger } from '@/utils/logger';
import type { WordTiming } from '@/types/spread-types';

const log = createLogger('API', 'RetouchApi');

// --- Types ---

export interface LayeringImageParams {
  imageUrl: string;
  description?: string;
  numberOfLayers?: number;
  goFast?: boolean;
  seed?: number | null;
  outputFormat?: 'webp' | 'jpg' | 'png';
  outputQuality?: number;
}

export interface LayeringImageResult {
  success: boolean;
  data?: { urls: string[]; contentType: string };
  error?: string;
  meta?: { processingTime?: number; replicatePredictionId?: string };
}

export interface EditObjectImageParams {
  prompt: string;
  imageUrl: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface EditObjectImageResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string };
}

export interface CropBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  aspectRatio: string;
}

export interface CropObjectImageParams {
  imageUrl: string;
  boundingBoxes: CropBoundingBox[];
}

export interface CropObjectResult {
  boxIndex: number;
  base64: string;
  mimeType: 'image/png';
  aspectRatio: string;
}

export interface CropObjectImageResult {
  success: boolean;
  data?: {
    croppedObjects: CropObjectResult[];
  };
  error?: string;
  meta?: { processingTime?: number; sourceWidth?: number; sourceHeight?: number };
}

export interface ImageRemoveBgParams {
  imageUrl: string;
  preserveAlpha?: boolean;
}

export interface ImageRemoveBgResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string };
}

export interface GenerateNarrationParams {
  script: string;
  voiceId: string;
  speed?: number;
  emotion?: string;
}

export interface GenerateNarrationResult {
  success: boolean;
  data?: {
    audioUrl: string;
    storagePath: string;
    voiceId: string;
    wordTimings?: WordTiming[];
  };
  error?: string;
  meta?: {
    processingTime?: number;
    audioEncoding?: string;
    sampleRateHertz?: number;
    characterCount?: number;
  };
}

// --- API ---

export async function callCropObjectImage(
  params: CropObjectImageParams
): Promise<CropObjectImageResult> {
  log.info('callCropObjectImage', 'start', { boxCount: params.boundingBoxes.length });
  return callEdgeFunction<CropObjectImageResult>(
    'retouch-crop-object-image',
    params
  );
}

export async function callEditObjectImage(
  params: EditObjectImageParams
): Promise<EditObjectImageResult> {
  log.info('callEditObjectImage', 'start', { promptLength: params.prompt.length, refCount: params.referenceImages?.length ?? 0 });
  return callEdgeFunction<EditObjectImageResult>(
    'retouch-edit-object-image',
    params
  );
}

export async function callImageRemoveBg(
  params: ImageRemoveBgParams
): Promise<ImageRemoveBgResult> {
  log.info('callImageRemoveBg', 'start', { imageUrl: params.imageUrl.slice(0, 80) });
  return callEdgeFunction<ImageRemoveBgResult>(
    'retouch-image-remove-bg',
    params
  );
}

export async function callGenerateNarration(
  params: GenerateNarrationParams
): Promise<GenerateNarrationResult> {
  log.info('callGenerateNarration', 'start', { scriptLength: params.script.length, voiceId: params.voiceId });
  return callEdgeFunction<GenerateNarrationResult>(
    'retouch-generate-narration',
    params
  );
}

export async function callLayeringImage(
  params: LayeringImageParams
): Promise<LayeringImageResult> {
  log.info('callLayeringImage', 'start', { hasDescription: !!params.description, layers: params.numberOfLayers });
  return callEdgeFunction<LayeringImageResult>(
    'retouch-layering-image',
    params
  );
}

// --- Segment Layer ---

export interface SegmentLayerParams {
  imageUrl: string;
  prompt: string;
  threshold?: number;
}

export interface SegmentLayerResult {
  success: boolean;
  data?: {
    imageUrl: string;
    storagePath: string;
  };
  error?: string;
  meta?: {
    processingTime?: number;
    mimeType?: string;
    sourceWidth?: number;
    sourceHeight?: number;
    coverageRatio?: number;
  };
}

export type SegmentLayerErrorCode =
  | 'EMPTY_SEGMENTATION'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'FETCH_ERROR'
  | 'GENERIC';

export class SegmentLayerError extends Error {
  code: SegmentLayerErrorCode;
  constructor(code: SegmentLayerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SegmentLayerError';
  }
}

export async function callSegmentLayer(
  params: SegmentLayerParams
): Promise<SegmentLayerResult> {
  const promptPreview = params.prompt.slice(0, 100);
  log.info('callSegmentLayer', 'start', { promptLen: params.prompt.length, threshold: params.threshold, promptPreview });
  try {
    const res = await callImageApi<SegmentLayerResult>('/api/retouch/segment-layer', params);
    if (!res.success) {
      const msg = res.error ?? 'Segmentation failed';
      const code = classifySegmentError(undefined, msg);
      log.error('callSegmentLayer', 'api error', { code, msg: msg.slice(0, 100) });
      throw new SegmentLayerError(code, msg);
    }
    log.info('callSegmentLayer', 'success', {
      coverageRatio: res.meta?.coverageRatio,
      ms: res.meta?.processingTime,
    });
    return res;
  } catch (err) {
    if (err instanceof SegmentLayerError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const code = classifySegmentError(err, message);
    log.error('callSegmentLayer', 'network error', { code, msg: message.slice(0, 100) });
    throw new SegmentLayerError(code, message);
  }
}

function classifySegmentError(err: unknown, message: string): SegmentLayerErrorCode {
  const lc = message.toLowerCase();
  if (lc.includes('no object') || lc.includes('empty') || lc.includes('matching prompt')) return 'EMPTY_SEGMENTATION';
  if (lc.includes('rate limit') || lc.includes('429')) return 'RATE_LIMIT';
  if (lc.includes('timed out') || lc.includes('timeout') || lc.includes('504')) return 'TIMEOUT';
  // HTTP status from edge function client error shape
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 422) return 'EMPTY_SEGMENTATION';
    if (status === 429) return 'RATE_LIMIT';
    if (status === 504) return 'TIMEOUT';
  }
  return 'GENERIC';
}
