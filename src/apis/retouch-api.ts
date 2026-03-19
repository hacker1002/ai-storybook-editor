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
  referenceImage?: {
    base64Data: string;
    mimeType: string;
  };
  aspectRatio?: string;
  imageSize?: string;
}

export interface EditObjectImageResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string };
}

// --- API ---

export async function callEditObjectImage(
  params: EditObjectImageParams
): Promise<EditObjectImageResult> {
  log.info('callEditObjectImage', 'start', { promptLength: params.prompt.length, hasReference: !!params.referenceImage });
  return callEdgeFunction<EditObjectImageResult>(
    'retouch-edit-object-image',
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
