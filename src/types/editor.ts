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
export type RetouchSpace = 'object' | 'animation' | 'remix';
export type DefaultSpace = 'preview' | 'history' | 'flag' | 'share' | 'collaborator' | 'setting';
export type CreativeSpaceType = ManuscriptSpace | IllustrationSpace | RetouchSpace | DefaultSpace;

// Save status indicator
export type SaveStatus = 'unsaved' | 'saving' | 'saved';

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
}

// Sync state for dirty tracking
export interface SyncState {
  isDirty: boolean;
  lastSavedAt: Date | null;
  isSaving: boolean;
  error: string | null;
}

// Shape settings for objects (fill + outline)
export interface BookShape {
  fill: { is_filled: boolean; color: string; opacity: number };
  outline: { color: string; width: number; radius: number; type: number };
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

// Full Book type matching database schema
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
  target_core_value: number | null;
  format_genre: number | null;
  content_genre: number | null;
  writing_style: number | null;
  format_id: string | null;
  era_id: string | null;
  location_id: string | null;
  artstyle_id: string | null;
  background_music: { title: string; media_url: string } | null;
  typography: Record<string, TypographySettings> | null;
  shape: BookShape | null;
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
