// sketch-sheet-api.ts — client for the 3 sketch entity-sheet generate endpoints
// (character | prop | stage). One sheet = one entity's variants laid out as cells.
// Mirrors illustration-api.ts convention: flat apis/*.ts + callImageApi<R>.
//
// Field mapping (per-kind): SketchVariant has only { key, visual_description } — the
// backend Pydantic model expects a per-kind entity key field (characterKey|propKey|stageKey)
// PLUS variantKey + visualDescription. The single-source SKETCH_SHEET_ENDPOINT map keeps
// path + entityKeyField together so a mismatch can't drift between kinds.

import { callImageApi, type ImageApiFailure } from './image-api-client';
import type { SketchEntityKind, SketchVariant } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'SketchSheetApi');

/** Per-kind route + the entity-key field name the backend expects on each variant row. */
const SKETCH_SHEET_ENDPOINT: Record<
  SketchEntityKind,
  { path: string; keyField: 'characterKey' | 'propKey' | 'stageKey' }
> = {
  characters: { path: '/api/sketch/generate-character-sheet', keyField: 'characterKey' },
  props: { path: '/api/sketch/generate-prop-sheet', keyField: 'propKey' },
  stages: { path: '/api/sketch/generate-stage-sheet', keyField: 'stageKey' },
};

export interface GenerateSketchSheetParams {
  entityKey: string;
  variants: SketchVariant[];
  /** UUID of `art_styles.id` (= `book.artstyle_id`), NOT the description. Backend fetches the row. */
  artStyleId: string;
}

export interface GenerateSketchSheetResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string; cellOrder: string[] };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

/**
 * Generate the entity sheet for one sketch entity. Maps the thin SketchVariant shape to the
 * per-kind backend contract (entityKeyField + variantKey + visualDescription). Never throws —
 * returns GenerateSketchSheetResult | ImageApiFailure (errorCode preserved for classification).
 */
export async function callGenerateSketchSheet(
  kind: SketchEntityKind,
  { entityKey, variants, artStyleId }: GenerateSketchSheetParams,
): Promise<GenerateSketchSheetResult | ImageApiFailure> {
  const { path, keyField } = SKETCH_SHEET_ENDPOINT[kind];
  log.info('callGenerateSketchSheet', 'start', { kind, entityKey, variantCount: variants.length });

  const body = {
    variants: variants.map((v) => ({
      [keyField]: entityKey,
      variantKey: v.key,
      visualDescription: v.visual_description,
    })),
    artStyleId,
  };

  return callImageApi<GenerateSketchSheetResult>(path, body);
}
