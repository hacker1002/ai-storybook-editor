// lineup-constants.ts — static config + pure helpers for SketchLineupSpace (design README §2).
//
// DRY: `KindGroupConfig` / `KIND_GROUPS` / `ZOOM` are REUSED from the Base space (same two groups,
// same zoom bounds) and only re-exported here so lineup files import from one place. `LineupEntry`
// lives in @/types/sketch (store + feature both consume it — see the type's doc comment).

import type { BaseKind, LineupEntry } from '@/types/sketch';
import { KIND_GROUPS, ZOOM, type KindGroupConfig } from '../sketch-base-creative-space/sketch-base-constants';

export { KIND_GROUPS, ZOOM };
export type { KindGroupConfig, BaseKind, LineupEntry };

/**
 * A variant can join the lineup only with BOTH a locked crop image AND a real-world height —
 * without either it cannot be placed on the shared ruler. Non-selectable rows still RENDER
 * (disabled + greyed + reason tooltip; memory: never-hide-disabled-ui).
 */
export const selectable = (entry: LineupEntry): boolean =>
  entry.imageUrl != null && entry.heightCm != null;

/**
 * Why a row is disabled + WHERE to fix it (design 01 §2.4). Both missing → both lines.
 * Returns null when the entry is selectable.
 */
export function disabledReason(entry: LineupEntry): string | null {
  const reasons: string[] = [];
  if (entry.imageUrl == null) reasons.push('No crop locked — lock one in the Base/Variants space');
  if (entry.heightCm == null) reasons.push('No height set — add it in the Edit modal (Base/Variants space)');
  return reasons.length > 0 ? reasons.join('\n') : null;
}

/** Sidebar row label — mock convention: "{entityKey}/{variantKey}", NO leading `@`. */
export const rowLabel = (entry: LineupEntry): string => `${entry.entityKey}/${entry.variantKey}`;

/** Default expanded state — both groups open (design README §2.2). */
export const DEFAULT_EXPANDED_GROUPS: Record<BaseKind, boolean> = { characters: true, props: true };
