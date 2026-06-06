import type { TraitType } from '@/types/human';

// Language type for editor localization
export interface Language {
  name: string;
  code: string;
}

// Pipeline steps in book creation workflow
export type PipelineStep = 'manuscript' | 'illustration' | 'retouch';

// Creative space types per pipeline step
export type ManuscriptSpace = 'doc' | 'dummy' | 'sketch';
export type IllustrationSpace = 'character' | 'prop' | 'stage' | 'spread' | 'branch';
// 'animation' removed — merged into 'object' space per ADR-028. Phase-06 cleans up consumer references.
export type RetouchSpace = 'object' | 'quiz' | 'remix';
export type DefaultSpace = 'preview' | 'history' | 'flag' | 'share' | 'collaborator' | 'setting';
export type CreativeSpaceType = ManuscriptSpace | IllustrationSpace | RetouchSpace | DefaultSpace;

// Save status indicator
export type SaveStatus = 'dirty' | 'auto-saving' | 'auto-saved' | 'manual-saving' | 'saved';

// Editor mode (book vs asset)
export type EditorMode = 'book' | 'asset';

// User points display
export interface UserPoints {
  current: number;
  total: number;
}

// Document types for manuscript editing
export type DocType = 'brief' | 'draft' | 'script' | 'other';

export interface ManuscriptDoc {
  type: DocType;
  title: string;
  content: string;
}

// Icon rail item configuration
export interface IconRailItemConfig {
  id: CreativeSpaceType;
  icon: string;
  label: string;
}

// Snapshot metadata
export interface SnapshotMeta {
  id: string | null;
  bookId: string | null;
  version: string | null;
  tag: string | null;
  autoSaveId: string | null;  // auto-save row id (save_type=2)
}

// Sync state for dirty tracking
export interface SyncState {
  isDirty: boolean;
  lastSavedAt: Date | null;        // last auto-save timestamp
  lastManualSavedAt: Date | null;  // last manual save timestamp
  isSaving: boolean;               // shared for both manual & auto
  isAutoSaving: boolean;           // true when auto-save is in progress
  error: string | null;
}

// Shape settings for objects (fill + outline)
export interface BookShape {
  fill: { is_filled: boolean; color: string; opacity: number };
  outline: { color: string; width: number; radius: number; type: number };
}

// Per-language typography for branch UI elements (question title + choice labels)
export interface BranchTypographySettings {
  family: string;
  size: number;
  color: string;
}

// Branch settings stored on book (book-level default for all branch UI)
export interface BookBranch {
  typography: Record<string, BranchTypographySettings>;
}

// ── Remix settings (book.remix JSONB) ─────────────────────────────────────
// Reshape 2026-05-21 (design 29fe1d6): narrator singular → voices[] collection;
// characters[] gain per-trait gating via traits[] (replaces the old `type` enum).
export type RemixLanguageCode = 'en_US' | 'vi_VN' | 'ja_JP' | 'ko_KR' | 'zh_CN';

/**
 * Runtime canonical list of supported narration languages — the single source the
 * video-worker (`render.ts`) imports for input validation instead of mirroring the
 * literal array. `satisfies readonly RemixLanguageCode[]` makes the compiler reject
 * any drift from the type above (add a code here AND to the type, or it won't build).
 */
export const REMIX_LANGUAGE_CODES = [
  'en_US',
  'vi_VN',
  'ja_JP',
  'ko_KR',
  'zh_CN',
] as const satisfies readonly RemixLanguageCode[];

/**
 * @deprecated Book-config remix dropped the `body`/`custom` character type in
 * favour of per-trait `traits[]` (see RemixCharacterEntry). Kept only until any
 * remix_config follow-up confirms it is unused. Do not use for new code.
 */
export type CharacterRemixType = 'body' | 'custom';

export interface RemixLanguageEntry {
  name: string;
  code: RemixLanguageCode;
  is_enabled: boolean;
}

// Per-trait gating for character swap. Keyed by `type`; order display-only.
export interface RemixTraitEntry {
  type: TraitType;
  is_enabled: boolean;
}

// Voice availability slot. key = 'narrator' (literal) | <character.key>.
// No voice_id — book configs availability only; the concrete voice is chosen at
// remix execution (remix_config.voices[].voice_id).
export interface RemixVoiceEntry {
  key: string;   // 'narrator' | <character.key>
  name: string;  // 'Narrator' | character.name (materialized for fallback render)
  is_enabled: boolean;
}

export interface RemixCharacterEntry {
  key: string;
  name: string;
  is_enabled: boolean;
  traits: RemixTraitEntry[]; // always 5 entries (TRAIT_TYPES); reader fills missing → true
}

export interface RemixPropEntry {
  key: string;
  name: string;
  is_enabled: boolean;
}

export interface BookRemix {
  languages: RemixLanguageEntry[];
  voices: RemixVoiceEntry[];
  characters: RemixCharacterEntry[];
  props: RemixPropEntry[];
}

// Reading effects (book.effects JSONB) — page transition + gyroscope toggle.
// transition_type enum is forward-compatible: player falls back to 'turn' on unknown values.
// gyroscope: persistence-only this phase; player runtime hook deferred to a later phase.
export type TransitionType = 'parallax' | 'turn' | 'slide' | 'fade' | 'flip' | 'zoom';

export interface BookEffectsSettings {
  transition_type: TransitionType;
  gyroscope: boolean;
}

// Book-level music mixer + background track (book.music JSONB)
export interface BookMusicSettings {
  background_id: string | null; // soft FK → musics.id
  volume_scale: number;          // 0..2, default 1.0
}

// Book-level SFX selectors + mixer volume (book.sound JSONB)
export interface BookSoundSettings {
  transition_id: string | null;  // soft FK → sounds.id
  true_id: string | null;        // soft FK → sounds.id (quiz right answer)
  wrong_id: string | null;       // soft FK → sounds.id (quiz wrong answer)
  volume_scale: number;          // 0..2, default 1.0
}

// Page numbering display settings
export type PageNumberingPosition = 'bottom_center' | 'bottom_corner' | 'top_corner' | 'none';

export interface PageNumberingSettings {
  position: PageNumberingPosition;
  color: string;       // hex
  font_family: string; // font family name, default: 'Inter'
  font_size: number;   // px, default: 18
}

// Template layout selection per slot (spread, left page, right page)
export interface BookTemplateLayout {
  spread: string;      // UUID → template_layouts
  left_page: string;   // UUID → template_layouts
  right_page: string;  // UUID → template_layouts
  page_numbering?: PageNumberingSettings;
}

// Geometry units are percentage (0-100) of the page dimensions
export interface TemplateLayoutGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TemplateLayoutTextbox {
  geometry: TemplateLayoutGeometry;
  'z-index': number;
}

export interface TemplateLayoutImage {
  geometry: TemplateLayoutGeometry;
  'z-index': number;
  edge_treatment: 'crop' | 'spot' | 'vignette';
}

export interface TemplateLayout {
  id: string;
  title: string;
  thumbnail_url: string;
  book_type: number;
  type: number;        // 1: double page spread, 2: single page
  textboxes: TemplateLayoutTextbox[];
  images: TemplateLayoutImage[];
}

// Per-language typography settings for textbox narration
export interface TypographySettings {
  size: number;
  weight: number;
  style: string;
  family: string;
  color: string;
  line_height: number;
  letter_spacing: number;
  decoration: string;
  text_align: string;
  text_transform: string;
}

// Per-language narrator voice entry (inside NarratorSettings hybrid JSONB)
export interface NarratorLanguageEntry {
  voice_id: string;
  media_url: string | null;
}

// Inference parameters shared across all languages for narrator preview/generation
export interface NarratorInferenceParams {
  speed: number;              // UI options: 0.75 | 1.0 | 1.25 (API range [0.7, 1.2])
  stability: number;          // 0..1
  similarity: number;         // 0..1 (maps to API `similarityBoost`)
  exaggeration: number;       // 0..1 (maps to API `style`) — renamed from `style_exaggeration` (DB-CHANGELOG §4 2026-04-28)
  speaker_boost: boolean;     // UI-persisted, NOT sent to API (v3 unsupported)
}

/**
 * Narrator settings hybrid JSONB stored on `books.narrator`.
 * - Literal keys: `model` + inference params (NarratorInferenceParams).
 * - Language keys: match /^[a-z]{2}_[A-Z]{2}$/ → NarratorLanguageEntry.
 * Indexer type is intentionally wide; use `splitNarrator` helper to narrow at point of use.
 */
export type NarratorSettings = NarratorInferenceParams & {
  model: string; // e.g. 'eleven_v3'
  [languageKey: string]: NarratorLanguageEntry | string | number | boolean;
};

/** JSONB multi-lang name: { "[language_key]": "..." } */
export type MultiLangName = Record<string, string>;

// Full Book type matching database schema
// ── Distribution (books.distribution + remixes.distribution JSONB) ──────────
// Export-artifact state per channel. Additive nullable column (DB-CHANGELOG
// 2026-06-01). Job handler is single-writer of status/media_url/file_size/
// exported_at/job_id; client only writes is_enabled. Reader MUST coalesce null
// → DEFAULT (see distribution-helpers.ts). Design §2.2.

export type ExportStatus =
  | 'pending'
  | 'exporting'
  | 'updated'
  | 'outdated'
  | 'failed';

export interface ExportVariantLeaf {
  is_enabled: boolean;
  status: ExportStatus;
  media_url: string | null;
  file_size: number | null; // bytes
  exported_at: string | null; // ISO8601
  job_id: string | null; // soft FK → background_jobs.id (set while exporting)
}

export type PlayerKey = 'web' | 'mobile' | 'ipad';
export type DigitalKey = 'epub' | 'pdf';
export type PrinterKey = '600dpi' | '300dpi';
export type VideoResKey = 'sd' | 'hd' | 'fhd' | 'qhd';
export type VideoType = 'classic' | 'dynamic';

export interface VideoDistributionEntry {
  type: VideoType;
  sd: ExportVariantLeaf;
  hd: ExportVariantLeaf;
  fhd: ExportVariantLeaf;
  qhd: ExportVariantLeaf;
}

export interface Distribution {
  player: Record<PlayerKey, ExportVariantLeaf>;
  digital: Record<DigitalKey, ExportVariantLeaf>;
  printer: Record<PrinterKey, ExportVariantLeaf>; // bracket access: dist.printer['300dpi']
  videos: VideoDistributionEntry[];
}

export type ChannelKey = 'player' | 'digital' | 'printer' | 'video';

export interface Book {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  step: number; // 1: manuscript, 2: illustration, 3: retouch
  type: number; // 0: source book, 1: normal book
  original_language: string;
  current_version: string | null;
  current_content: Record<string, unknown> | null;
  cover: { thumbnail_url?: string; normal_url?: string } | null;
  book_type: number | null;
  dimension: number | null;
  target_audience: number | null;
  format_id: string | null;
  era_id: string | null;
  location_id: string | null;
  artstyle_id: string | null;
  typography: Record<string, TypographySettings> | null;
  narrator: NarratorSettings | null;
  shape: BookShape | null;
  branch: BookBranch | null;
  music: BookMusicSettings | null;
  sound: BookSoundSettings | null;
  effects: BookEffectsSettings | null;
  remix: BookRemix | null;
  template_layout: BookTemplateLayout | null;
  distribution?: Distribution | null; // export-artifact state (additive, optional)
  created_at: string;
  updated_at: string;
}

// Simplified for list display
export interface BookListItem {
  id: string;
  title: string;
  description: string | null;
  cover: { thumbnail_url?: string; normal_url?: string } | null;
  owner_id: string;
  step: number;
  type: number;
  created_at: string;
  updated_at: string;
}

// File attachment for PromptPanel
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

// File upload constraints
export const FILE_CONSTRAINTS = {
  maxFiles: 5,
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  acceptedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  acceptedExtensions: '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt',
} as const;

export const MAX_FILENAME_DISPLAY_LENGTH = 15;
