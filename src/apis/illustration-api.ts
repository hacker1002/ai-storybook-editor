import { callEdgeFunction } from './edge-function-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'IllustrationApi');

// --- Types ---

export interface GenerateCharacterBaseParams {
  characterKey: string;
  basicInfo: {
    description: string;
    gender: string;
    age: string;
    category_id: string;
    role: string;
  };
  personality: {
    core_essence: string;
    flaws?: string;
    emotions?: string;
    reactions?: string;
    desires?: string;
    likes?: string;
    fears?: string;
    contradictions?: string;
  };
  baseVariant: {
    appearance: {
      height?: number;
      hair?: string;
      eyes?: string;
      face?: string;
      build?: string;
    };
    visual_description: string;
  };
  artStyleDescription: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateCharacterBaseResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

export interface GenerateCharacterVariantParams {
  characterKey: string;
  variantKey: string;
  variantAppearance?: {
    height?: number;
    hair?: string;
    eyes?: string;
    face?: string;
    build?: string;
  };
  variantVisualDescription: string;
  baseVariantImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateCharacterVariantResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- API ---

export async function callGenerateCharacterBase(
  params: GenerateCharacterBaseParams
): Promise<GenerateCharacterBaseResult> {
  log.info('callGenerateCharacterBase', 'start', {
    characterKey: params.characterKey,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateCharacterBaseResult>(
    'illustration-generate-character-base',
    params
  );
}

export async function callGenerateCharacterVariant(
  params: GenerateCharacterVariantParams
): Promise<GenerateCharacterVariantResult> {
  log.info('callGenerateCharacterVariant', 'start', {
    characterKey: params.characterKey,
    variantKey: params.variantKey,
    refCount: params.additionalReferenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateCharacterVariantResult>(
    'illustration-generate-character-variant',
    params
  );
}
