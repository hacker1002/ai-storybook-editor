// sketch-variants-constants.ts — static config + local UI-state shapes for SketchVariantsSpace.
// The Variant creative space covers NON-BASE variants of BOTH kinds (character + prop) in ONE
// space (no `kind` prop). Split out (Phase 05) so root/sidebar/content/modals each stay < 500
// lines, and so the modal connector can import the state shapes without pulling in the whole root.
//
// ⚡ `titleCase` is ALSO consumed by the sibling sketch-base-creative-space (shared helper, single
//    source — base-sheet-content-area / edit-base-entity-modal / sketch-base-edit-image-modal import
//    it from here). Do NOT remove or move it.

import type { BaseKind, VariantRef } from '@/types/sketch';

/** Per-kind config for the two variant groups (Character / Prop). Stage has NO variant sheet. */
export interface KindGroupConfig {
  kind: BaseKind;
  /** Group header title. */
  title: string;
  /** Singular noun for empty-state / labels. */
  noun: string;
}

/** Fixed order: Character then Prop. Variant workspace covers char + prop only (no Stage). */
export const KIND_GROUPS: KindGroupConfig[] = [
  { kind: 'characters', title: 'Character', noun: 'character' },
  { kind: 'props', title: 'Prop', noun: 'prop' },
];

/** Zoom bounds for the content-area preview. Applied as CSS width % (NOT transform:scale —
 *  memory: zoom-via-css-width / reference generate-canvas.tsx) so overflow scroll metrics stay
 *  correct at > 100% (top/left corners reachable). */
export const ZOOM = { min: 25, max: 200, step: 5, default: 100 } as const;

/** Two-phase generate status (single-flight op) for a variant row / the content area. */
export type VariantGeneratePhase = 'generate' | 'cut';

export interface VariantGenStatus {
  isBusy: boolean;
  phase?: VariantGeneratePhase;
  error?: string;
}

/** Generate gate reasons — FE fail-fast mirroring the endpoint's hard preconditions (08/09 §Error).
 *  ⚡ ADR-047: the `no-art-style` reason was REMOVED — generate no longer needs an art style (style
 *  is inferred from the BASE_VARIANT; backend dropped artStyleId). Remaining: BASE_NOT_READY +
 *  EMPTY_VARIANT_DESCRIPTION. */
export type VariantGateReason = 'base-not-ready' | 'empty-text';

export interface VariantGate {
  canGenerate: boolean;
  reason?: VariantGateReason;
}

/** Tooltip copy per gate reason (design 01 §2.4). */
export const GATE_TOOLTIP: Record<VariantGateReason, string> = {
  'base-not-ready': 'Generate the base variant first',
  'empty-text': 'Add a description before generating',
};

/** Shared EditImageModal binding target, discriminated by SCOPE (mirrors the base space's target).
 *  `raw` = the 21:9 sheet shown in the Raw tab — committing an edit AUTO re-cuts the 4 cells
 *  (overwrites crops[]); `crop` = one of the 4 candidate cells — edits that cell ONLY.
 *  Consumed by the modal connector (§3.4). */
export type EditImageTarget =
  | { kind: BaseKind; entityKey: string; variantKey: string; scope: 'raw' }
  | { kind: BaseKind; entityKey: string; variantKey: string; scope: 'crop'; cropIndex: number };

/** Shared ExtractImageModal binding target — CROP scope only (reframe one candidate cell → a new
 *  version of it). The raw 21:9 sheet is excluded (its cells come from the auto-cut, not a manual
 *  crop). Consumed by VariantExtractImageModal (→ crops[cropIndex].illustrations + onCreateImages). */
export interface ExtractImageTarget {
  kind: BaseKind;
  entityKey: string;
  variantKey: string;
  cropIndex: number;
}

/** Structural equality for two variant refs (null-safe). Used by the root (derive selection,
 *  match the running op) and the sidebar (highlight the selected row). */
export function sameRef(a: VariantRef | null | undefined, b: VariantRef | null | undefined): boolean {
  return (
    !!a && !!b && a.kind === b.kind && a.entityKey === b.entityKey && a.variantKey === b.variantKey
  );
}

/** true when a text field is absent / whitespace-only (drives the `empty-text` gate). */
export function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Display name derived from a thin entity/variant key (`kid_hero` → `Kid Hero`).
 *  ⚡ Shared helper — ALSO imported by sketch-base-creative-space. Do NOT remove. */
export function titleCase(key: string): string {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
