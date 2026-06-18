// extract-image-modal-constants.ts — Shared types, tab registry, model/layer constants,
// and re-exported layout tokens for the full-screen "Extracting Image" workspace
// (design extract-image-modal/README.md §2.2/§2.6). Consolidates SegmentLayerModal +
// SplitImageModal. Layout/theme/z-index are REUSED from the swap modal (design §2.6);
// this module only carries extract-specific types + option lists + numeric ranges.

import { Tag, Type, Crop, Box, Layers, Image as ImageIcon, Disc } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Re-export the shell layout tokens / z-index / sidebar dims from the swap modal (single
// source — design §2.6 "reuse swap shell"). Children import these from HERE so the modal
// has one constants surface, not two import paths.
export {
  SWAP_MODAL_TOKENS,
  Z_INDEX,
  HEADER_HEIGHT_PX,
  LEFT_SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';

// ── Shared types (README §2.2) ───────────────────────────────────────────────

/** Tab discriminator. `segment` + `layering` are in scope; the rest are deferred
 *  registry slots (rendered disabled with a "Coming soon" tooltip). */
export type ExtractTabKey =
  | 'segment'
  | 'layering'
  | 'get_object'
  | 'get_text'
  | 'crop'
  | 'background'
  | 'lottie';

/** How a fresh run merges into the tab's grid — segment accumulates, layering replaces. */
export type ExtractRunMode = 'append' | 'replace';

/** One ephemeral, pre-commit result. Unifies the old `SegmentResult` (1/run) and
 *  `SplitLayerResult` (N/run). `media_url` is the API ephemeral URL until commit swaps
 *  in the uploaded Storage publicUrl. */
export interface ExtractResult {
  id: string;
  media_url: string;
  sourceTab: ExtractTabKey;
  title: string;
  meta?: { prompt?: string; coverageRatio?: number; layerIndex?: number };
}

/** Per-tab metadata. `runExtract` + `ParamsPanel` live in the tab files (segment-tab /
 *  layers-tab); the root only consumes this contract to render the tab bar + dispatch. */
export interface ExtractTabContract {
  key: ExtractTabKey;
  label: string;
  icon: LucideIcon;
  runMode: ExtractRunMode;
  enabled: boolean;
}

// ── Tab registry (README §2.2 — order + labels match mock #ex-fs-tabs) ────────
export const EXTRACT_TABS: ExtractTabContract[] = [
  { key: 'get_object', label: 'Objects', icon: Tag, runMode: 'replace', enabled: false },
  { key: 'get_text', label: 'Texts', icon: Type, runMode: 'replace', enabled: false },
  { key: 'crop', label: 'Crops', icon: Crop, runMode: 'replace', enabled: false },
  { key: 'segment', label: 'Segments', icon: Box, runMode: 'append', enabled: true },
  { key: 'layering', label: 'Layers', icon: Layers, runMode: 'replace', enabled: true },
  { key: 'background', label: 'Background', icon: ImageIcon, runMode: 'replace', enabled: false },
  { key: 'lottie', label: 'Lottie', icon: Disc, runMode: 'replace', enabled: false },
];

/** Default tab when `initialTab` is not supplied (README §2.2). */
export const DEFAULT_EXTRACT_TAB: ExtractTabKey = 'segment';

// ── Segments tab (01-segment-tab.md §2) ──────────────────────────────────────
// ⚡v1 single SAM3 dispatch; `threshold` not exposed (API default 0.5 — YAGNI).
export const SEGMENT_MODEL_OPTIONS = ['mattsays/sam3-image'] as const;
export const DEFAULT_SEGMENT_MODEL = 'mattsays/sam3-image';

// ── Layers tab (02-layers-tab.md §2) ─────────────────────────────────────────
// ⚡v1 single Qwen dispatch; `description`/`seed` not exposed (API defaults).
export const LAYERS_MODEL_OPTIONS = ['qwen/qwen-image-layered'] as const;
export const DEFAULT_LAYERS_MODEL = 'qwen/qwen-image-layered';
export const LAYER_COUNT_MIN = 2;
export const LAYER_COUNT_MAX = 8; // API cap (01-layering-image) — NOT 10, see 02-layers-tab §7.
export const LAYER_COUNT_DEFAULT = 3;
