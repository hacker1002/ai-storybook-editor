// prop-types.ts - TypeScript interfaces for Prop entities (matches DB schema)

export type ContentTab = 'variants' | 'sounds' | 'crops';

export type PropType = 'narrative' | 'anchor';

/** 0 = base variant, 1 = user-created variant */
export type PropVariantType = 0 | 1;

/** Provenance discriminator for an illustration entry (DB-CHANGELOG 2026-06-18, additive).
 *  'created' = AI generate; 'uploaded' = user upload (no AI); 'edited' = Edit-modal output. */
export type IllustrationType = 'created' | 'uploaded' | 'edited';

export interface Illustration {
  media_url: string;
  created_time: string;
  is_selected: boolean;
  /** Provenance (additive, optional → non-breaking). Absent entries coerce to 'created' on read. */
  type?: IllustrationType;
  /** Pre-edit source URL — set ⇔ type='edited'. Provenance-only; never enters the effective-URL resolve chain. */
  original_url?: string;
  /** Soft ref → ai_service_logs.id (⚡NEW 2026-07-23). Provenance for AI-generated/edited entries
   *  (created/edited); absent = NULL (uploaded/legacy). Dangling-tolerant (id may precede row insert). */
  ai_request_id?: string;
}

/** Coerce-on-read provenance: legacy/absent `type` reads as 'created' (YAGNI — no writer-side validator). */
export function coerceIllustrationType(entry: Pick<Illustration, 'type'>): IllustrationType {
  return entry.type ?? 'created';
}

export interface ImageReference {
  title: string;
  media_url: string;
}

export interface PropVariant {
  name: string;
  key: string;
  type: PropVariantType;
  visual_description: string;
  illustrations: Illustration[];
  image_references: ImageReference[];
}

export interface PropSound {
  name: string;
  key: string;
  description: string;
  media_url: string;
}

export interface Crop {
  /** id of the SOURCE image layer in `illustration.spreads[].images[]`.
   *  Matches the `crops[].id` param of remix API 01/02 (API takes it verbatim).
   *  Renamed from the legacy `layer_id`. Spec: DB-CHANGELOG [2026-05-25]. */
  id: string;
  /** id of the source spread the crop was lifted from. Metadata only — never
   *  feeds the layout engine; re-attached at emit time by `placement.id`. */
  spread_id: string;
  spread_number: number;
  aspect_ratio: string;
  name: string;
  variant: string;
  media_url: string;
  /** px, sheet-relative — computed by crop-sheet-layout-engine.
   *  Before 2026-05-19 this was relative to a fixed 2688×1512 spread;
   *  now it is absolute pixels within the parent crop sheet's sheet_geometry. */
  geometry: { x: number; y: number; w: number; h: number };
  'z-index': number;
}

/** asset_categories row from DB. type: 1=human, 2=animal, 3=plant, 4=item */
export interface AssetCategory {
  id: string;
  name: string;
  type: number;
  description: string | null;
}

export interface Prop {
  order: number;
  name: string;
  key: string;
  category_id: string;
  type: PropType;
  variants: PropVariant[];
  sounds: PropSound[];
}
