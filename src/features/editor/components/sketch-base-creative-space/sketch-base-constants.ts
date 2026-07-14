// sketch-base-constants.ts — static config + local UI-state shapes for SketchBaseSpace.
// Split out (Phase 05) so root/sidebar/content each stay < 500 lines, and so the Phase 06
// overlay modals can import the modal-state types without pulling in the whole root.

import type { BaseKind, SketchBaseStyle } from '@/types/sketch';

/** Per-kind labels for the two base groups (Character / Prop). Stage has NO base sheet. */
export interface KindGroupConfig {
  kind: BaseKind;
  /** Group header title. */
  title: string;
  /** Singular noun for the empty-state ("No {noun} sketch generated yet"). */
  noun: string;
  /** Excel sheet name read on import (Phase 06). */
  sheetName: string;
}

/** Fixed order: Character then Prop. Base workspace covers char + prop only (no Stage). */
export const KIND_GROUPS: KindGroupConfig[] = [
  { kind: 'characters', title: 'Character', noun: 'character', sheetName: 'Characters' },
  { kind: 'props', title: 'Prop', noun: 'prop', sheetName: 'Props' },
];

/** Zoom bounds for the content-area preview. Applied as CSS width % (NOT transform:scale —
 *  see generate-canvas.tsx / memory: zoom-via-css-width) so overflow scroll metrics stay correct. */
export const ZOOM = { min: 25, max: 200, step: 5, default: 100 } as const;

/** Singular noun for a base kind (empty-state / edit-image title). */
export function nounForKind(kind: BaseKind): string {
  return kind === 'characters' ? 'character' : 'prop';
}

// ── Local UI-state shapes (owned by the root; typed here so Phase 06 modals can import) ──

/** Which style the content area is showing. null = none yet (auto-select derives one in render). */
export interface SelectedStyleRef {
  kind: BaseKind;
  index: number;
}

/** GenerateStyleModal state — `add` appends a style, `regenerate` overwrites styles[styleIndex]. */
export interface GenerateModalState {
  kind: BaseKind;
  mode: 'add' | 'regenerate';
  styleIndex?: number;
}

/** EditBaseEntityModal state — edits the base-variant text of every entity in a kind. */
export interface EditEntityModalState {
  kind: BaseKind;
}

/** Shared EditImageModal binding target — `raw` edits the whole sheet, `crop` edits one entity crop.
 *  Consumed by the Phase 06 EditImageModal wiring (scope → illustrations + onUpdate + pathPrefix). */
export type EditImageTarget =
  | { kind: BaseKind; styleIndex: number; scope: 'raw' }
  | { kind: BaseKind; styleIndex: number; scope: 'crop'; entityKey: string };

/**
 * Auto-select the first available style for the content area. Preference order (design §2.3):
 * is_selected char → char[0] → is_selected prop → prop[0] → null (nothing imported yet).
 * Pure — called from a `useMemo` in render (React 19: NO set-state-in-render).
 */
export function pickFirstAvailable(
  charStyles: SketchBaseStyle[],
  propStyles: SketchBaseStyle[],
): SelectedStyleRef | null {
  const charLocked = charStyles.findIndex((s) => s.is_selected);
  if (charLocked >= 0) return { kind: 'characters', index: charLocked };
  if (charStyles.length > 0) return { kind: 'characters', index: 0 };
  const propLocked = propStyles.findIndex((s) => s.is_selected);
  if (propLocked >= 0) return { kind: 'props', index: propLocked };
  if (propStyles.length > 0) return { kind: 'props', index: 0 };
  return null;
}
