// edit-image-modal-constants.ts — Shared types, edit-tool registry, model/option lists,
// and re-exported layout tokens for the full-screen "Editing Image" workspace
// (design edit-image-modal/README.md §2.2/§2.6). Consolidates the old EditImageModal
// (prompt+removeBg) + EraseImageModal (paint). Layout/theme/z-index are REUSED from the
// swap modal (design §2.6 "reuse swap shell"); this module only carries edit-specific
// types + option lists + numeric ranges.

import { Brush, Maximize, Expand, CircleSlash, Type, ImageOff, Eraser } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Re-export the shell layout tokens / z-index / sidebar dims from the swap modal (single
// source — design §2.6). Children import these from HERE so the modal has one constants
// surface, not two import paths (mirror extract-image-modal-constants).
export {
  SWAP_MODAL_TOKENS,
  Z_INDEX,
  HEADER_HEIGHT_PX,
  LEFT_SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';

// ── Shared types (README §2.2) ───────────────────────────────────────────────

/** Edit-tool discriminator. `remove_background` + `erasor` are in scope; the rest are
 *  deferred registry slots (rendered disabled with a "Coming soon" tooltip). Key order +
 *  labels mirror the mock #edit-fs-tabs (left → right). */
export type EditToolKey =
  | 'inpaint'
  | 'outpaint'
  | 'upscale'
  | 'remove_object'
  | 'remove_text'
  | 'remove_background'
  | 'erasor';

/** Canvas interaction model per tool: `preview` = static <img>; `paint` = interactive
 *  eraser canvas. Compare overrides both to a before/after slider (derived, not a tool). */
export type EditCanvasMode = 'preview' | 'paint';

/** Per-tool metadata. `commit` + `ParamsPanel` (+ `CanvasLayer` for paint) live in the tab
 *  files (remove-bg-tab / eraser-tab); the root only consumes this contract to render the
 *  tab bar + dispatch. */
export interface EditToolContract {
  key: EditToolKey;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  canvasMode: EditCanvasMode;
}

// ── Tool registry (README §2.2 — order + labels match mock #edit-fs-tabs) ──────
export const EDIT_TOOLS: EditToolContract[] = [
  { key: 'inpaint', label: 'Inpaint', icon: Brush, enabled: false, canvasMode: 'paint' },
  { key: 'outpaint', label: 'Outpaint', icon: Maximize, enabled: false, canvasMode: 'preview' },
  { key: 'upscale', label: 'Upscale', icon: Expand, enabled: false, canvasMode: 'preview' },
  { key: 'remove_object', label: 'Remove Object', icon: CircleSlash, enabled: false, canvasMode: 'paint' },
  { key: 'remove_text', label: 'Remove Text', icon: Type, enabled: false, canvasMode: 'preview' },
  { key: 'remove_background', label: 'Remove BG', icon: ImageOff, enabled: true, canvasMode: 'preview' },
  { key: 'erasor', label: 'Erasor', icon: Eraser, enabled: true, canvasMode: 'paint' },
];

/** Default landing tool when `initialTool` is not supplied (README §2.2). Inpaint is the
 *  mock-default but is deferred → landing MUST be the first enabled tool. */
export const DEFAULT_EDIT_TOOL: EditToolKey = 'remove_background';

/** Per-tool `[+]` button hint (aria-label + tooltip) — README §3.2. */
export const COMMIT_HINTS: Partial<Record<EditToolKey, string>> = {
  remove_background: 'Run remove background',
  erasor: 'Save erased version',
};

// ── Remove BG tab (01-remove-bg-tab.md §2) ───────────────────────────────────

/** Replicate rmbg model allowlist (mock dropdown + API §model + swap RMBG_MODEL_OPTIONS).
 *  FE default matches API default (`bria`); FE still sends explicit `model` on every call. */
export type RmbgModel = '851-labs/background-remover' | 'bria/remove-background';
export const RMBG_MODEL_OPTIONS: readonly RmbgModel[] = [
  'bria/remove-background',
  '851-labs/background-remover',
];
export const DEFAULT_RMBG_MODEL: RmbgModel = 'bria/remove-background';

/** Output background mode. Only `transparent`/`color` reach the API; `blur`/`overlay`
 *  are deferred (rendered disabled — API 04-image-remove-bg has no support yet). */
export type OutputBgMode = 'transparent' | 'color' | 'blur' | 'overlay';
export const DEFAULT_OUTPUT_BG: OutputBgMode = 'transparent';
export const DEFAULT_OUTPUT_COLOR = '#FFFFFF';

// ── Eraser tab (02-eraser-tab.md §2) ─────────────────────────────────────────
export const BRUSH = { min: 1, max: 100, step: 1, default: 30 } as const;
export const DEFAULT_ERASER_COLOR = '#FFFFFF';
/** Strokes count at which Reset asks for confirmation (mirror erase-modal cũ). */
export const RESET_CONFIRM_THRESHOLD = 3;

// ── Canvas zoom (README §2.6 ⚡H) ─────────────────────────────────────────────
/** Stage zoom range — applied as CSS width/height scale on the canvas content (NOT
 *  `transform: scale`, see README §2.6 revision 2026-06-22). Eraser canvas pixel buffer
 *  stays at fitSize; CSS width/height is scaled; cursor coords × zoom/100. */
export const ZOOM = { min: 50, max: 400, step: 5, default: 100 } as const;

// ── Swap-modal-themed outline button class ───────────────────────────────────
/** Classes for shadcn `<Button variant="outline">` inside the swap-modal dark theme.
 *  Default `bg-background` + inherited foreground is unreadable against the modal's
 *  forced-dark surface (text-on-light or light-on-light depending on app theme). Override
 *  with swap-modal CSS variables. Used by Eraser History buttons + RemoveBG dropdown. */
export const SWAP_MODAL_OUTLINE_BUTTON_CLASS =
  'bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] focus-visible:ring-[var(--swap-modal-accent)]';
