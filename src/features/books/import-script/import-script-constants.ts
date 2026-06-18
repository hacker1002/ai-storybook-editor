// import-script-constants.ts — Mapping constants for the Excel → snapshot
// importer. Mirrors design spec §7, plus default raw-layer geometry consts
// (validated decision S1 option (b): default rect constants; geometry is editable
// in the editor afterward, and generate-scene only needs visual_description).

import type { Geometry } from '@/types/spread-types';
import type { Lane } from './import-script-types';

export const SHEET = {
  STORYBOARD: 'Storyboard',
  FLOW: 'Flow',
  CHARACTERS: 'Characters',
  PROPS: 'Props',
  STAGES: 'Stages',
} as const;

export const ROW_LABEL = {
  DIEN_BIEN: 'Diễn biến',
  STAGE: 'Stage',
  LOI_VAN: 'Lời văn',
  CHI_DAO: 'Chỉ đạo hình ảnh',
  CHOICE: 'Choice',
} as const;

/** Lane → Storyboard columns (0-based; column 0 = row label).
 *  Extended to nhanh_2/nhanh_3 for ≥3-branch headroom (left = 1+2·idx, right = 2+2·idx).
 *  More lanes can be appended without touching the parse algorithm. */
export const LANE_COLUMNS: Record<Lane, { left: number; right: number }> = {
  truc_chinh: { left: 1, right: 2 }, // TRỤC CHÍNH — TRÁI / PHẢI
  nhanh_1: { left: 3, right: 4 },    // NHÁNH 1 — TRÁI / PHẢI
  nhanh_2: { left: 5, right: 6 },
  nhanh_3: { left: 7, right: 8 },
};

export const DPS_MARKER = 'TRANG ĐÔI'; // appears in the SPREAD header row
export const DEFAULT_LANE: Lane = 'truc_chinh';

/** SPREAD header detector — captures the block's spread number. */
export const SPREAD_HEADER_RE = /SPREAD\s+(\d+)/i;

/**
 * Node-id parser. NOTE — intentionally DIVERGES from the spec §7 regex
 * `/^(?:(?<lane>[a-z]+(?:_\d+)?)\.)?(?<n>\d+)$/`, which only matches numeric-
 * suffixed lanes (`nhanh_1`) and FAILS on the multi-word default lane
 * `truc_chinh` (the `_chinh` segment is non-numeric). This corrected form accepts
 * any underscore-separated lowercase/alnum lane prefix.
 *   'truc_chinh.11' → { lane:'truc_chinh', n:11 }
 *   'nhanh_1.11'    → { lane:'nhanh_1',    n:11 }
 *   '16'            → { lane: DEFAULT_LANE, n:16 }
 */
export const NODE_ID_RE = /^(?:(?<lane>[a-z]+(?:_[a-z0-9]+)*)\.)?(?<n>\d+)$/;

/** Sentinel for the Flow `to` of an ending node. */
export const FLOW_END = 'END';

// ── Default raw-layer geometry (percentage 0-100, spread-relative) ─────────────
// Spread = 2 pages side-by-side. Full-bleed image fills its slot; textbox sits in
// a bottom band. These mirror what `convertPageGeometryToSpread` would yield for a
// full-bleed page (left x∈[0,50], right x∈[50,100]). All editable post-import.

export const DEFAULT_DPS_IMAGE_GEO: Geometry = { x: 0, y: 0, w: 100, h: 100 };
export const DEFAULT_LEFT_IMAGE_GEO: Geometry = { x: 0, y: 0, w: 50, h: 100 };
export const DEFAULT_RIGHT_IMAGE_GEO: Geometry = { x: 50, y: 0, w: 50, h: 100 };

export const DEFAULT_DPS_TEXTBOX_GEO: Geometry = { x: 10, y: 78, w: 80, h: 18 };
export const DEFAULT_LEFT_TEXTBOX_GEO: Geometry = { x: 5, y: 78, w: 40, h: 18 };
export const DEFAULT_RIGHT_TEXTBOX_GEO: Geometry = { x: 55, y: 78, w: 40, h: 18 };

/** Page background fallback (book.shape/page bg not set at import time). */
export const DEFAULT_PAGE_BACKGROUND = { color: '#FFFFFF', texture: null } as const;
