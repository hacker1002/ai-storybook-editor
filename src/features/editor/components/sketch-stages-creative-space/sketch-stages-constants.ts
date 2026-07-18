// sketch-stages-constants.ts — static config + local UI-state shapes for SketchStagesSpace
// (design sketch-stages-creative-space README §2/§4.2). Split out so root/sidebar/content/modals
// each stay < 500 lines and the modal connectors can import the state shapes without the root.
//
// The space manages EVERY stage: per-stage style workspace (base.styles[]) + non-base variant
// rows, one content area with TWO bindings (base style attempt | variant) — same displayed shape
// (2-cell sheet / 2 positional crops).

import type { StageSelection } from '@/types/sketch';

// Selection identity re-exported from types/sketch (single source — the store op targets and the
// UI selection share it).
export type { StageSelection };

/** Zoom bounds — CSS width % driver (NOT transform:scale; memory zoom-via-css-width). Same
 *  bounds as the sibling sketch spaces. */
export const ZOOM = { min: 25, max: 200, step: 5, default: 100 } as const;

/** Crop card ratio: 7:6 — one half of the 21:9 sheet (landscape, fits a stage backdrop). */
export const STAGE_CROP_ASPECT_CLASS = 'aspect-[7/6]';

/** Two-phase generate status projected for a row / the content area (from the single-flight op). */
export interface StageGenStatus {
  isBusy: boolean;
  phase?: 'generate' | 'cut';
  error?: string;
}

/** ✨ gate reasons — FE fail-fast mirroring API 12's hard preconditions. */
export type StageGateReason = 'base-not-ready' | 'empty-text';

export interface StageGate {
  canGenerate: boolean;
  reason?: StageGateReason;
}

/** Tooltip copy per gate reason (design 01 §2.4). */
export const STAGE_GATE_TOOLTIP: Record<StageGateReason, string> = {
  'base-not-ready': 'Lock a base style & pick a crop first',
  'empty-text': 'Add a visual design first',
};

/** Shared EditImageModal binding target — 4 scopes (design README §3.5). Raw scopes AUTO re-cut
 *  on commit (overwrite crops[], 0 picked); crop scopes edit that one cell only. */
export type StageEditImageTarget =
  | { stageKey: string; scope: 'base-raw'; styleIndex: number }
  | { stageKey: string; scope: 'base-crop'; styleIndex: number; cropIndex: number }
  | { stageKey: string; scope: 'variant-raw'; variantKey: string }
  | { stageKey: string; scope: 'variant-crop'; variantKey: string; cropIndex: number };

/** Shared ExtractImageModal binding target — CROP scope only (reframe one cell → new version;
 *  the cell's is_selected pick is untouched). */
export type StageExtractImageTarget =
  | { stageKey: string; scope: 'base-crop'; styleIndex: number; cropIndex: number }
  | { stageKey: string; scope: 'variant-crop'; variantKey: string; cropIndex: number };

/** GenerateStageStyleModal state (＋ add / regenerate one style attempt). */
export interface GenerateStyleModalState {
  stageKey: string;
  mode: 'add' | 'regenerate';
  styleIndex?: number; // required when mode='regenerate'
}

/** EditStageVariantModal state — variantKey 'base' (Base header ✏) or non-base (row ✏). */
export interface EditTextModalState {
  stageKey: string;
  variantKey: string;
}

/** true when a text field is absent / whitespace-only (drives the `empty-text` gate). */
export function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}
