// stage-tab-config.ts — Declarative per-stage config for the 3 stage tabs of
// the swap modal pipeline (design 05-11-stage-batch-tab.md §3.1).
//
// The 3 stage tabs (Crops / Remove BG / Upscale) are isomorphic; everything
// that differs between them is captured HERE as data so the shared hook
// (`useStageBatchTab`) + thin tab instances never branch on the stage by hand.
// Imperative per-stage parts (precondition fn, seed) intentionally stay OUT of
// this object (design note: keep the config declarative; the hook resolves the
// precondition per stage).
//
// Job phase + endpoint segment are sourced from `STAGE_JOB_CONFIG`
// (types/remix.ts) so the store and the UI can never drift.

import {
  STAGE_JOB_CONFIG,
  type RemixJobPhase,
  type RemixModalTab,
  type StageKind,
} from "@/types/remix";

/** BEFORE compose treatment (05-03 §2.2): `ordinal` = composer-parity wrapper
 *  (4px stroke + ordinal badge — Gemini needs the numbers); `plain` = bare
 *  crops, no stroke/badge (parity with job 09's plain compose). */
export type StageComposeMode = "ordinal" | "plain";

/** AFTER source priority (05-03 §4.1):
 *  - `crops-or-sheet`: compose `selectedSwap.crops[]` ⋈ original; legacy
 *    single-img fallback when crops[] is empty (mixes / Sprites).
 *  - `sheet-or-crops`: the persisted sheet `media_url` (RGBA) WINS as a 1-img
 *    fast path; compose crops as fallback (rmbgs).
 *  - `crops-only`: ALWAYS compose crops — `media_url` is null (upscales);
 *    print-dim pieces fit-in-box (object-contain), never stretched. */
export type StageAfterComposeMode =
  | "crops-or-sheet"
  | "sheet-or-crops"
  | "crops-only";

export interface StageTabConfig {
  stage: StageKind;
  /** Stable tab id (≠ display label). */
  tabId: RemixModalTab;
  /** Tab pill label: Crops | Remove BG | Upscale. */
  label: string;
  /** Stage-header action button label: Swap | Remove BG | Upscale. */
  actionLabel: string;
  jobPhase: RemixJobPhase;
  endpointSegment: "mix-swap" | "rmbg" | "upscale";
  /** Import button + empty-state CTA (05-14) — rmbgs/upscales only. */
  hasImport: boolean;
  /** Settings (config review, 05-10) — mixes only. */
  hasSettings: boolean;
  /** ⚡2026-06-27 — per-batch Check (`[✓]` slot, swap-defect detect, 05-15) —
   *  mixes ONLY (identity swap). rmbgs/upscales have no swap → no defect → slot
   *  hidden. */
  hasDetect: boolean;
  /** Right-sidebar parameter group (05 §3.8). */
  paramsGroup: "swap" | "rmbg" | "upscale";
  composeMode: StageComposeMode;
  afterComposeMode: StageAfterComposeMode;
  /** false = BATCH_MIN 1 + auto-seed (mixes); true = 0 batches valid
   *  (empty-state CTA Import — rmbgs/upscales, no auto-seed). */
  allowZeroBatch: boolean;
}

export const STAGE_TAB_CONFIG: Record<StageKind, StageTabConfig> = {
  mixes: {
    stage: "mixes",
    tabId: "batches",
    label: "Crops",
    actionLabel: "Swap",
    jobPhase: STAGE_JOB_CONFIG.mixes.phase,
    endpointSegment: STAGE_JOB_CONFIG.mixes.endpointSegment,
    hasImport: false,
    hasSettings: true,
    hasDetect: true,
    paramsGroup: "swap",
    composeMode: "ordinal",
    afterComposeMode: "crops-or-sheet",
    allowZeroBatch: false,
  },
  rmbgs: {
    stage: "rmbgs",
    tabId: "rmbg",
    label: "Remove BG",
    actionLabel: "Remove BG",
    jobPhase: STAGE_JOB_CONFIG.rmbgs.phase,
    endpointSegment: STAGE_JOB_CONFIG.rmbgs.endpointSegment,
    hasImport: true,
    hasSettings: false,
    hasDetect: false,
    paramsGroup: "rmbg",
    composeMode: "plain",
    afterComposeMode: "crops-or-sheet",
    allowZeroBatch: true,
  },
  upscales: {
    stage: "upscales",
    tabId: "upscale",
    label: "Upscale",
    actionLabel: "Upscale",
    jobPhase: STAGE_JOB_CONFIG.upscales.phase,
    endpointSegment: STAGE_JOB_CONFIG.upscales.endpointSegment,
    hasImport: true,
    hasSettings: false,
    hasDetect: false,
    paramsGroup: "upscale",
    composeMode: "plain",
    afterComposeMode: "crops-only",
    allowZeroBatch: true,
  },
};

/** Tab id → stage column for the 3 stage tabs (`'variants'` has no stage). */
export const STAGE_OF_TAB: Record<
  Exclude<RemixModalTab, "variants">,
  StageKind
> = {
  batches: "mixes",
  rmbg: "rmbgs",
  upscale: "upscales",
};

// Pipeline predecessor lives in types/remix.ts (store needs it too) —
// re-exported here for modal-folder convenience.
export { PREV_STAGE } from "@/types/remix";
