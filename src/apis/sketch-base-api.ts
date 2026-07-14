// sketch-base-api.ts — client for the base-sheet workflow (design store #14, api 05/06/07).
// Two calls the base-generate job slice chains for ONE style attempt: generate the RAW sheet (all
// base entities of one kind laid out as cells — 05|06 dispatched by kind) then crop each entity out
// of that sheet (07, kind-agnostic CV). Mirrors sketch-sheet-api.ts: flat apis/*.ts + callImageApi<R>
// (X-API-Key + Bearer built in). Never throws — returns Result | ImageApiFailure, with errorCode
// preserved so the slice can classify (LLM_ERROR / ART_STYLE_NO_REFERENCES / ALL_CROPS_FAILED …).
//
// Wire shape is camelCase (backend Pydantic): generate → { imageUrl, storagePath, cellOrder, grid },
// crop → { crops: [{ key, imageUrl, geometry, source }], skipped?: [{ key }] }. Both under a
// { success, data } envelope (same as GenerateSketchSheetResult) — the slice reads r.data.*.

import { callImageApi, type ImageApiFailure } from './image-api-client';
import type { BaseKind } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'SketchBaseApi');

/** Per-kind RAW-sheet generate route (05 = character, 06 = prop). */
const BASE_SHEET_ENDPOINT: Record<BaseKind, string> = {
  characters: '/api/sketch/generate-base-character-sheet',
  props: '/api/sketch/generate-base-prop-sheet',
};

/** Crop (07) is kind-agnostic — single route; `kind` travels in the body. */
const CROP_BASE_SHEET_ENDPOINT = '/api/sketch/crop-base-sheet';

/** One base entity's text row for the sheet prompt (camelCase — backend contract). */
export interface BaseSheetEntity {
  key: string;
  description: string;
  height: string;
  visualDescription: string;
  artLanguage: string;
}

/** Style reference image — inline base64 OR a storage URL (backend SSRF-guards the URL). */
export type BaseReferenceImage = { base64Data: string; mimeType: string } | { media_url: string };

/** Sheet grid geometry echoed by generate (pass-through — not consumed by the slice). */
export interface SheetGrid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

/** Bounding rect of one crop within the raw sheet (pass-through). */
export interface CropGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One cropped entity lifted out of the raw sheet. */
export interface BaseSheetCrop {
  key: string;
  imageUrl: string;
  geometry: CropGeometry;
  source: string;
}

export interface GenerateBaseSheetParams {
  entities: BaseSheetEntity[];
  /** UUID of `art_styles.id` (= `book.sketchstyle_id`). Backend fetches the row (description + refs). */
  artStyleId: string;
  stylePrompt: string;
  referenceImages: BaseReferenceImage[];
}

export interface GenerateBaseSheetResult {
  success: boolean;
  data?: { imageUrl: string; storagePath: string; cellOrder: string[]; grid: SheetGrid };
  error?: string;
  meta?: { processingTime?: number; mimeType?: string; tokenUsage?: number };
}

export interface CropBaseSheetParams {
  imageUrl: string;
  /** key + order only — positional index must match the generate reading-order (cell↔entity). */
  entities: Array<{ key: string }>;
  kind: BaseKind;
}

export interface CropBaseSheetResult {
  success: boolean;
  data?: { crops: BaseSheetCrop[]; skipped?: Array<{ key: string }> };
  error?: string;
  meta?: { processingTime?: number };
}

/**
 * Generate the RAW base sheet for one kind (all base entities as cells). Dispatches 05|06 by kind.
 * Never throws — returns GenerateBaseSheetResult | ImageApiFailure (errorCode preserved).
 */
export async function callGenerateBaseSheet(
  kind: BaseKind,
  { entities, artStyleId, stylePrompt, referenceImages }: GenerateBaseSheetParams,
): Promise<GenerateBaseSheetResult | ImageApiFailure> {
  const path = BASE_SHEET_ENDPOINT[kind];
  log.info('callGenerateBaseSheet', 'start', {
    kind,
    entityCount: entities.length,
    referenceCount: referenceImages.length,
  });
  return callImageApi<GenerateBaseSheetResult>(path, {
    entities,
    artStyleId,
    stylePrompt,
    referenceImages,
  });
}

/**
 * Crop each entity out of an already-generated raw sheet (07, CV). `imageUrl` comes straight from
 * the generate result or the effective raw illustration — this endpoint reads no DB.
 * Never throws — returns CropBaseSheetResult | ImageApiFailure (errorCode preserved).
 */
export async function callCropBaseSheet({
  imageUrl,
  entities,
  kind,
}: CropBaseSheetParams): Promise<CropBaseSheetResult | ImageApiFailure> {
  log.info('callCropBaseSheet', 'start', { kind, entityCount: entities.length });
  return callImageApi<CropBaseSheetResult>(CROP_BASE_SHEET_ENDPOINT, { imageUrl, entities, kind });
}
