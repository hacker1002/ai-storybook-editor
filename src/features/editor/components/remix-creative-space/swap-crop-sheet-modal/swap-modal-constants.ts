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
  scale: 4,
};

/** Zoom slider range — applied as the stage canvas-inner `width/height`
 *  (not `transform: scale()`, so `scrollWidth/Height` stay accurate for
 *  fit + anchor scrolling). `min` is 10 so a large sheet (e.g. 3000×1285)
 *  can fit-to-canvas inside a narrow viewport (design 05-03 §4.2/§4.6). */
export const ZOOM = { min: 10, max: 400, step: 5, default: 100 } as const;

/** Scale stepper range (right sidebar). */
export const SCALE = { min: 2, max: 10, step: 1, default: 4 } as const;

/** Each entity key must keep at least this many crop sheets. */
export const SHEET_MIN = 1;

/** Tooltip reason — swap deferred in v1 (swap API not yet available). */
export const SWAP_DISABLED_REASON =
  'Swap chưa khả dụng — API chưa sẵn sàng';

// ── Layout constants (design §4.12) ──────────────────────────────────────────
export const HEADER_HEIGHT_PX = 49;
export const LEFT_SIDEBAR_WIDTH_PX = 300;
export const RIGHT_SIDEBAR_WIDTH_PX = 320;

// ── Dark theme tokens (design §4.12 + remix.html mockup ref) ─────────────────

/** Dark palette tokens for SwapCropSheetModal (design §4.12 + remix.html ref).
 *  Applied as CSS variables on the modal root element; child components read
 *  via Tailwind arbitrary values e.g. `bg-[var(--swap-modal-surface)]`.
 *  Typed as `Record<string, string>` (React's `CSSProperties` doesn't allow
 *  `--*` custom-property keys; cast at the consumer when spreading into `style`). */
export const SWAP_MODAL_TOKENS = {
  '--swap-modal-backdrop': 'rgba(8, 10, 18, 0.96)',
  '--swap-modal-bg': '#0a0d18',
  '--swap-modal-surface': 'rgba(255, 255, 255, 0.03)',
  '--swap-modal-surface-hover': 'rgba(255, 255, 255, 0.06)',
  '--swap-modal-surface-hover-strong': 'rgba(255, 255, 255, 0.14)',
  '--swap-modal-selection': 'rgba(59, 108, 246, 0.18)',
  '--swap-modal-border': 'rgba(255, 255, 255, 0.08)',
  '--swap-modal-border-strong': 'rgba(255, 255, 255, 0.18)',
  '--swap-modal-text-primary': '#ffffff',
  '--swap-modal-text-secondary': 'rgba(255, 255, 255, 0.7)',
  '--swap-modal-text-muted': 'rgba(255, 255, 255, 0.55)',
  '--swap-modal-accent': '#3b6cf6',
  '--swap-modal-accent-hover': '#2f5ce0',
  '--swap-modal-accent-soft': 'rgba(59, 108, 246, 0.12)',
  '--swap-modal-card-bg': '#14171f',
  '--swap-modal-canvas-bg': '#0c0f16',
  '--swap-modal-sheet-frame-bg': '#ffffff', // sheet frame still white (pop on dark canvas)
} as const satisfies Record<string, string>;

/** Z-index layering — swap modal vs Variants overlay (design §4.12). */
export const Z_INDEX = {
  swapModal: 4000,
  variantsModal: 5000,
} as const;

/** Icon SVG path for [▣] (variants visual) button — from remix.html mockup.
 *  Inlined inside <svg> in Phase 04 sidebar rewrite (KISS — no extra file). */
export const VARIANT_ICON_PATH =
  'M3 3 H21 V21 H3 Z M12 3 V21 M12 8 H17 M12 12 H17 M12 16 H17';
