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

// --- API ---

export async function callLayeringImage(
  params: LayeringImageParams
): Promise<LayeringImageResult> {
  log.info('callLayeringImage', 'start', { hasDescription: !!params.description, layers: params.numberOfLayers });
  return callEdgeFunction<LayeringImageResult>(
    'retouch-layering-image',
    params
  );
}
