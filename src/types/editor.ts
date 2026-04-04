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

// Page numbering display settings
export type PageNumberingPosition = 'bottom_center' | 'bottom_corner' | 'top_corner' | 'none';

export interface PageNumberingSettings {
  position: PageNumberingPosition;
  color: string; // hex
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
  branch: BookBranch | null;
  template_layout: BookTemplateLayout | null;
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
