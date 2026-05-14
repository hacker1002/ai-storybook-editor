// remix.ts — Domain types for Remix feature (DB row + ephemeral inject job state)
// DB row JSONB structure: snapshot illustration/characters/props snapshot + remix_config + mixes.

import type { BaseSpread } from './spread-types';
import type { IllustrationData, Section } from './illustration-types';
import type { Character } from './character-types';
import type { Prop, Crop } from './prop-types';
import type { RemixLanguageCode } from './editor';
import type { Human } from './human';

// Re-export book-level remix entries so consumers have a single import point.
export type {
  BookRemix,
  RemixLanguageEntry,
  RemixNarratorEntry,
  RemixCharacterEntry,
  RemixPropEntry,
  RemixLanguageCode,
  CharacterRemixType,
} from './editor';

// ── CropSheet (remix variant) ────────────────────────────────────────────────
// Base CropSheet from prop-types.ts has `{title, image_url, crops[]}`.
// Remix variant adds `swap_results[]` to record AI-driven swap output.

export interface SwapResult {
  media_url: string;
  created_time: string;
  is_selected: boolean;
}

/** Re-export of crop entry shape from prop-types for consumer convenience. */
export type RemixCrop = Crop;

export interface RemixCropSheet {
  title: string;
  image_url: string;
  swap_results: SwapResult[];
  crops: Crop[];
}

// ── Cloned entity snapshots (DB JSONB columns) ───────────────────────────────
// Mirror snapshot Character/Prop shape but replace `crop_sheets` with the
// remix variant carrying `swap_results`. Prop also drops `sounds` (not used).

export type RemixCharacter = Omit<Character, 'crop_sheets'> & {
  crop_sheets: RemixCropSheet[];
};

export type RemixProp = Omit<Prop, 'crop_sheets' | 'sounds'> & {
  crop_sheets: RemixCropSheet[];
};

/** Mix entry — auto-generated from multi-subject layer tags during clone. */
export interface RemixMix {
  order: number;
  /** Composed display name e.g. "Elara & Magic Sword" (preserves tag order, not sorted). */
  name: string;
  /** Soft refs to remix.characters[].key | remix.props[].key. */
  keys: string[];
  crop_sheets: RemixCropSheet[];
}

// ── Spread (display-only subset of BaseSpread) ───────────────────────────────
// Drop editor-only fields. We intentionally keep this as a Pick so the existing
// CanvasSpreadView<RemixSpread> generic continues to type-check.

export type RemixSpread = Omit<
  BaseSpread,
  'raw_images' | 'raw_textboxes' | 'manuscript' | 'tiny_sketch_media_url'
>;

export interface RemixIllustration {
  spreads: RemixSpread[];
  sections: Section[];
}

// ── Remix config (user-driven picks) ─────────────────────────────────────────

export interface RemixNarratorChoice {
  name: string;
  voice_id: string | null;
}

export interface RemixCharacterChoice {
  key: string;
  human_id: string | null;
  visual: string | null;
  voice_id: string | null;
  is_enabled: boolean;
}

export interface RemixPropChoice {
  key: string;
  prop_id: string | null;
  visual: string | null;
  is_enabled: boolean;
}

export interface RemixLanguageChoice {
  name: string;
  code: RemixLanguageCode | string;
  is_enabled: boolean;
}

export interface RemixConfig {
  narrator?: RemixNarratorChoice;
  characters: RemixCharacterChoice[];
  props: RemixPropChoice[];
  languages: RemixLanguageChoice[];
}

// ── Top-level DB row ─────────────────────────────────────────────────────────

export interface Remix {
  id: string;
  snapshot_id: string;
  name: string;
  remix_config: RemixConfig;
  illustration: RemixIllustration;
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  created_at: string;
  updated_at: string;
}

/** Shape used when INSERTing into Supabase (omits server-managed cols). */
export type InsertableRemixRow = Omit<Remix, 'id' | 'created_at' | 'updated_at'>;

/** Shape returned by Supabase select — id/created_at/updated_at + JSONB columns. */
export interface RemixRow {
  id: string;
  snapshot_id: string;
  name: string;
  remix_config: RemixConfig;
  illustration: IllustrationData; // raw JSONB — caller narrows to RemixIllustration on read
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  created_at: string;
  updated_at: string;
}

// ── Inject job (ephemeral, store-local) ──────────────────────────────────────

export type InjectJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'partial-error'
  | 'error'
  | 'cancelled';

export type InjectJobStage = 'text-swap' | 'audio-chunk' | 'crop-swap' | 'persist';

export interface InjectJobError {
  stage: InjectJobStage;
  spreadId?: string;
  entityKey?: string;
  message: string;
}

export interface InjectJob {
  id: string;
  remixId: string;
  status: InjectJobStatus;
  progress: number;
  startedAt: string;
  completedAt?: string;
  errors: InjectJobError[];
  cancelFlag: boolean;
}

// ── Filter state (sidebar popover) ───────────────────────────────────────────
// Empty arrays = no filter (all checked semantic — see Phase 06).

export interface RemixFilterState {
  characterKeys: string[];
  propKeys: string[];
}

// ── Sidebar callback target ──────────────────────────────────────────────────

export interface SwapCropSheetTarget {
  remixId: string;
  type: 'character' | 'prop' | 'mix';
  key: string;
}

// ── Mix signature helper (used by clone-builder + downstream consumers) ──────
/** Stable dedupe identifier for a mix — sorted keys joined by comma. */
export function mixSignature(keys: string[]): string {
  return [...keys].sort().join(',');
}

// ── Text Swap Engine (Phase 1) ───────────────────────────────────────────────
// Sync client-side swap of `character.name` → `humans.display_name[lang]` over
// remix illustration textbox text + audio chunk scripts. Pure function, no I/O.
// Spec: ai-storybook-design/component/stores/remix-store.md §10.

/** Warning kinds emitted during swap-map build / apply. 5 kinds —
 *  `short_source_name` dropped per Validation Session 1 (CJK 2-char names valid). */
export type TextSwapWarningKind =
  | 'no_human_picked'
  | 'stale_human_fk'
  | 'missing_display_name'
  | 'no_op_swap'
  | 'empty_source_name';

export interface TextSwapWarning {
  kind: TextSwapWarningKind;
  characterKey?: string;
  language?: string;
  source?: string;
  target?: string;
}

export interface TextSwapInput {
  illustration: RemixIllustration;
  remixCharacters: RemixCharacter[];
  configCharacters: RemixCharacterChoice[];
  enabledLanguages: string[];
  humans: Record<string, Human>;
}

export interface TextSwapResult {
  illustration: RemixIllustration;
  warnings: TextSwapWarning[];
  matchCount: number;
  chunksMarkedUnsynced: number;
}
