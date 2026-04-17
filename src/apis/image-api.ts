import { callEdgeFunction } from './edge-function-client';
import { createLogger } from '@/utils/logger';
import type { AspectRatio } from '@/constants/aspect-ratio-constants';

export type { AspectRatio };

const log = createLogger('API', 'ImageApi');

// --- Types ---

export interface NormalizeRatioParams {
  rawPath: string;
  outputPrefix?: string;
}

export interface NormalizeRatioResult {
  success: boolean;
  data?: {
    publicUrl: string;
    path: string;
    ratio: AspectRatio;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/svg+xml';
    srcDimensions: { width: number; height: number };
    outputDimensions: { width: number; height: number };
    wasPadded: boolean;
  };
  meta?: {
    processingTime?: number;
    paddedPixels?: number;
  };
  error?: string;
  code?: string;
  srcRatio?: number;
  minSupportedRatio?: number;
}

export interface GenerateFromDescriptionParams {
  description: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateFromDescriptionResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- API ---

export async function callNormalizeRatio(params: NormalizeRatioParams): Promise<NormalizeRatioResult> {
  log.info('callNormalizeRatio', 'start', { rawPath: params.rawPath, outputPrefix: params.outputPrefix });
  return callEdgeFunction<NormalizeRatioResult>('image-normalize-ratio', params);
}

export async function callGenerateFromDescription(
  params: GenerateFromDescriptionParams
): Promise<GenerateFromDescriptionResult> {
  log.info('callGenerateFromDescription', 'start', {
    descriptionLength: params.description.length,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateFromDescriptionResult>(
    'image-generate-from-description',
    params
  );
}
