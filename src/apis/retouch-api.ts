import { callEdgeFunction } from './edge-function-client';
import { createLogger } from '@/utils/logger';

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
    durationMs?: number;
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
