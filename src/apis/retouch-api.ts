import { callEdgeFunction } from './edge-function-client';
import { callImageApi, type ImageApiFailure } from './image-api-client';
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
  meta?: { processingTime?: number; numberOfLayers?: number; replicatePredictionId?: string };
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
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
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
  width?: number;
  height?: number;
}

export interface CropObjectImageResult {
  success: boolean;
  data?: {
    croppedObjects: CropObjectResult[];
  };
  error?: string;
  meta?: {
    processingTime?: number;
    sourceWidth?: number;
    sourceHeight?: number;
    sourceMimeType?: string;
    inputBytes?: number;
  };
}

export interface ImageRemoveBgParams {
  imageUrl: string;
  preserveAlpha?: boolean;
}

export interface ImageRemoveBgResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; replicatePredictionId?: string };
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
): Promise<CropObjectImageResult | ImageApiFailure> {
  log.info('callCropObjectImage', 'start', { boxCount: params.boundingBoxes.length });
  const res = await callImageApi<CropObjectImageResult>('/api/retouch/crop-object-image', params);
  if (res.success) {
    const data = (res as CropObjectImageResult).data;
    log.info('callCropObjectImage', 'success', {
      count: data?.croppedObjects.length ?? 0,
      processingMs: (res as CropObjectImageResult).meta?.processingTime,
    });
  } else {
    const { error, httpStatus, errorCode } = res as ImageApiFailure;
    log.error('callCropObjectImage', 'error', { errorCode, httpStatus, msg: error?.slice(0, 100) });
  }
  return res;
}

export async function callEditObjectImage(
  params: EditObjectImageParams
): Promise<EditObjectImageResult | ImageApiFailure> {
  log.info('callEditObjectImage', 'start', {
    promptLength: params.prompt.length,
    refCount: params.referenceImages?.length ?? 0,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
  });
  const res = await callImageApi<EditObjectImageResult>('/api/retouch/edit-object-image', params);
  if (res.success) {
    const r = res as EditObjectImageResult;
    log.info('callEditObjectImage', 'success', {
      processingMs: r.meta?.processingTime,
      mimeType: r.meta?.mimeType,
    });
  } else {
    const { error, httpStatus, errorCode } = res as ImageApiFailure;
    log.error('callEditObjectImage', 'error', { errorCode, httpStatus, msg: error?.slice(0, 100) });
  }
  return res;
}

export async function callImageRemoveBg(
  params: ImageRemoveBgParams
): Promise<ImageRemoveBgResult | ImageApiFailure> {
  log.info('callImageRemoveBg', 'start', {
    imageUrl: params.imageUrl.slice(0, 80),
    preserveAlpha: params.preserveAlpha,
  });
  const res = await callImageApi<ImageRemoveBgResult>('/api/retouch/image-remove-bg', params);
  if (res.success) {
    const r = res as ImageRemoveBgResult;
    log.info('callImageRemoveBg', 'success', {
      processingMs: r.meta?.processingTime,
      mimeType: r.meta?.mimeType,
      predictionId: r.meta?.replicatePredictionId,
    });
  } else {
    const { error, httpStatus, errorCode } = res as ImageApiFailure;
    log.error('callImageRemoveBg', 'error', { errorCode, httpStatus, msg: error?.slice(0, 100) });
  }
  return res;
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
): Promise<LayeringImageResult | ImageApiFailure> {
  log.info('callLayeringImage', 'start', { hasDescription: !!params.description, layers: params.numberOfLayers });
  const res = await callImageApi<LayeringImageResult>('/api/retouch/layering-image', params);
  if (res.success) {
    const meta = (res as LayeringImageResult).meta;
    log.info('callLayeringImage', 'success', {
      layerCount: (res as LayeringImageResult).data?.urls.length ?? 0,
      processingMs: meta?.processingTime,
      predictionId: meta?.replicatePredictionId,
    });
  } else {
    const { error, httpStatus, errorCode } = res as ImageApiFailure;
    log.error('callLayeringImage', 'error', { errorCode, httpStatus, msg: error?.slice(0, 100) });
  }
  return res;
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

export async function callSegmentLayer(
  params: SegmentLayerParams
): Promise<SegmentLayerResult | ImageApiFailure> {
  const promptPreview = params.prompt.slice(0, 100);
  log.info('callSegmentLayer', 'start', { promptLen: params.prompt.length, threshold: params.threshold, promptPreview });
  const res = await callImageApi<SegmentLayerResult>('/api/retouch/segment-layer', params);
  if (res.success) {
    log.info('callSegmentLayer', 'success', { coverageRatio: (res as SegmentLayerResult).meta?.coverageRatio });
  } else {
    const { error, httpStatus, errorCode } = res as ImageApiFailure;
    log.error('callSegmentLayer', 'error', { errorCode, httpStatus, msg: error?.slice(0, 100) });
  }
  return res;
}
