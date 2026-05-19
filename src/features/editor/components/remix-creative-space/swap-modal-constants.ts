// swap-modal-constants.ts — Constants for SwapCropSheetModal (design §2.2 + §4.12).
// Kept in a dedicated module so header / sidebar / stage sub-components can share
// the same option lists and numeric ranges without re-importing the modal root.

import type { SwapModelParams } from '@/types/remix';

/** Entity kind discriminator — mirrors the inline union used across the
 *  remix types (`'character' | 'prop' | 'mix'`). Declared here so modal
 *  sub-components share one named alias. */
export type RemixEntityType = 'character' | 'prop' | 'mix';

/** AI swap model options (right sidebar — v1 collect-only, not wired to API). */
export const SWAP_MODEL_OPTIONS = [
  'google/nano-banana-pro',
  'openai/gpt-image-2',
  'bytedance/seedream-4.5',
] as const;

/** AI upscale model options (right sidebar — v1 collect-only). */
export const UPSCALE_MODEL_OPTIONS = [
  'nightmareai/real-esrgan',
  'recraft-ai/recraft-crisp-upscale',
  'alexgenovese/upscaler',
] as const;

/** Default right-sidebar params — re-applied on every modal open (ephemeral). */
export const DEFAULT_SWAP_PARAMS: SwapModelParams = {
  swapModel: 'google/nano-banana-pro',
  upscaleModel: 'nightmareai/real-esrgan',
  scale: 2,
};

/** Zoom slider range — applied as the stage canvas-inner `width/height`
 *  (not `transform: scale()`, so `scrollWidth/Height` stay accurate for
 *  fit + anchor scrolling). `min` is 10 so a large sheet (e.g. 3000×1285)
 *  can fit-to-canvas inside a narrow viewport (design 05-03 §4.2/§4.6). */
export const ZOOM = { min: 10, max: 400, step: 5, default: 100 } as const;

/** Scale stepper range (right sidebar). */
export const SCALE = { min: 2, max: 10, step: 1, default: 2 } as const;

/** Each entity key must keep at least this many crop sheets. */
export const SHEET_MIN = 1;

/** Tooltip reason — swap deferred in v1 (swap API not yet available). */
export const SWAP_DISABLED_REASON =
  'Swap chưa khả dụng — API chưa sẵn sàng';

// ── Layout constants (design §4.12) ──────────────────────────────────────────
export const HEADER_HEIGHT_PX = 49;
export const LEFT_SIDEBAR_WIDTH_PX = 300;
export const RIGHT_SIDEBAR_WIDTH_PX = 320;
