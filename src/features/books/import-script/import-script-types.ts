// import-script-types.ts — Intermediate parse-model interfaces for the
// client-side "Import Script" flow (Excel → snapshot). Mirrors design spec
// `books-page/07-01-import-script-excel.md` §6. Pure types — no logic.

/** Story lane. Default lane = 'truc_chinh'; branch lanes = `nhanh_<n>`. */
export type Lane = 'truc_chinh' | `nhanh_${number}`;

/** One content cell of a single page (the 4 storyboard content labels). */
export interface ParsedPageCell {
  dien_bien?: string;        // scene beat → raw_images[].art_note + spread.manuscript
  stage_ref?: string;        // '@stage_key/variant' → raw_images[].stage_variant
  loi_van?: string;          // → raw_textboxes[][language_key].text
  chi_dao_hinh_anh?: string; // art direction → raw_images[].visual_description (drives generate-scene)
}

/** One snapshot spread (= one Flow node). Joined from Storyboard by (number, lane). */
export interface ParsedSpreadCell {
  node_id: string;           // '7' | 'truc_chinh.11' | 'nhanh_1.11'
  spread_number: number;
  lane: Lane;
  is_dps: boolean;           // header marker 'TRANG ĐÔI'
  pages: ParsedPageCell[];   // 1 (DPS) | 2 (left, right)
}

/** One Flow graph edge. */
export interface ParsedFlowEdge {
  from: string;
  type: 'continue' | 'choice' | 'end';
  choice_prompt?: string;    // only type='choice'
  label?: string;            // only type='choice'
  to: string;                // node_id | 'END'
}

/** One catalog entity row (1 row = 1 variant). */
export interface ParsedEntityRow {
  entity_type: 'character' | 'prop' | 'stage';
  key: string;               // 'kid'
  variant_key: string;       // 'base' | 'hero'
  ref: string;               // '@kid/base' (cross-check only)
  description: string;
}

/** A Flow node resolved to its lane + spread number. */
export interface ParsedNode {
  node_id: string;
  spread_number: number;
  lane: Lane;
}

/** Aggregate output of parseExcel — everything downstream build/validate needs. */
export interface ParsedWorkbook {
  edges: ParsedFlowEdge[];
  nodes: ParsedNode[];
  cells: ParsedSpreadCell[];
  characters: ParsedEntityRow[];
  props: ParsedEntityRow[];
  stages: ParsedEntityRow[];
  /** Non-fatal observations collected during parse (e.g. DPS right column had content). */
  warnings: string[];
}

/**
 * Book metadata collected by the import modal (the file carries content only,
 * never book format/dimension/artstyle). Shape matches `CreateBookParams`.
 */
export interface ImportModalMeta {
  title: string;
  format_id: string;
  dimension: number;
  target_audience: number;
  artstyle_id: string | null;
  original_language: string;
}

/** Result contract returned by `importScript` to the modal caller. */
export interface ImportScriptResult {
  ok: boolean;
  bookId?: string;
  errors: string[];
  warnings: string[];
}
