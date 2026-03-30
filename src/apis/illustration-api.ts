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

// --- Prop Base Types ---

export interface GeneratePropBaseParams {
  propKey: string;
  propName: string;
  propType: "narrative" | "anchor";
  categoryName: string;
  categoryType: number;
  baseStateVisualDescription: string;
  artStyleDescription: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GeneratePropBaseResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Prop Base API ---

export async function callGeneratePropBase(
  params: GeneratePropBaseParams
): Promise<GeneratePropBaseResult> {
  log.info('callGeneratePropBase', 'start', {
    propKey: params.propKey,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GeneratePropBaseResult>(
    'illustration-generate-prop-base',
    params
  );
}

// --- Prop Variant Types ---

export interface GeneratePropVariantParams {
  propKey: string;
  variantKey: string;
  variantVisualDescription: string;
  basePropImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GeneratePropVariantResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Prop Variant API ---

export async function callGeneratePropVariant(
  params: GeneratePropVariantParams
): Promise<GeneratePropVariantResult> {
  log.info('callGeneratePropVariant', 'start', {
    propKey: params.propKey,
    variantKey: params.variantKey,
    refCount: params.additionalReferenceImages?.length ?? 0,
  });
  return callEdgeFunction<GeneratePropVariantResult>(
    'illustration-generate-prop-variant',
    params
  );
}

// --- Stage Base Types ---

export interface GenerateStageBaseParams {
  stageKey: string;
  stageName: string;
  locationDescription: string;
  baseSetting: {
    visual_description: string;
    temporal?: { era?: string; season?: string; weather?: string; time_of_day?: string };
    sensory?: { atmosphere?: string; soundscape?: string; lighting?: string; color_palette?: string };
    emotional?: { mood?: string };
  };
  artStyleDescription: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateStageBaseResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Stage Base API ---

export async function callGenerateStageBase(
  params: GenerateStageBaseParams
): Promise<GenerateStageBaseResult> {
  log.info('callGenerateStageBase', 'start', {
    stageKey: params.stageKey,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateStageBaseResult>(
    'illustration-generate-stage-base',
    params
  );
}

// --- Stage Variant Types ---

export interface GenerateStageVariantParams {
  stageKey: string;
  variantKey: string;
  variantVisualDescription: string;
  variantTemporal?: { era?: string; season?: string; weather?: string; time_of_day?: string };
  variantSensory?: { atmosphere?: string; soundscape?: string; lighting?: string; color_palette?: string };
  variantEmotional?: { mood?: string };
  baseStageImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateStageVariantResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Stage Variant API ---

export async function callGenerateStageVariant(
  params: GenerateStageVariantParams
): Promise<GenerateStageVariantResult> {
  log.info('callGenerateStageVariant', 'start', {
    stageKey: params.stageKey,
    variantKey: params.variantKey,
    refCount: params.additionalReferenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateStageVariantResult>(
    'illustration-generate-stage-variant',
    params
  );
}

// --- Scene Types ---

export interface GenerateSceneParams {
  visualDescription: string;
  artStyleDescription: string;
  stageVariantImageUrl?: string;
  referenceImages?: Array<{ base64Data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface GenerateSceneResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

// --- Scene API ---

export async function callGenerateScene(
  params: GenerateSceneParams
): Promise<GenerateSceneResult> {
  log.info('callGenerateScene', 'start', {
    hasStageVariantImage: !!params.stageVariantImageUrl,
    refCount: params.referenceImages?.length ?? 0,
  });
  return callEdgeFunction<GenerateSceneResult>(
    'illustration-generate-scene',
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
