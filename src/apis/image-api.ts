import { callEdgeFunction } from './edge-function-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'ImageApi');

// --- Types ---

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
