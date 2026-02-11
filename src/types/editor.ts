// Language type for editor localization
export interface Language {
  name: string;
  code: string;
}

// Pipeline steps in book creation workflow
export type PipelineStep = 'manuscript' | 'illustration' | 'retouch';

// Creative space types per pipeline step
export type ManuscriptSpace = 'doc' | 'dummy' | 'sketch';
export type IllustrationSpace = 'character' | 'prop' | 'stage' | 'spread';
export type RetouchSpace = 'object' | 'animation' | 'remix';
export type DefaultSpace = 'history' | 'flag' | 'share' | 'collaborator' | 'setting';
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

// Minimal book type for EditorPage
export interface Book {
  id: string;
  title: string;
  type: number; // 1=book, 0=asset
  original_language: string;
}

// Book settings for Brief attributes
export interface BookSettings {
  targetAudience: string;
  targetCoreValue: string;
  formatGenre: string;
  contentGenre: string;
}

// Book references (optional attributes)
export interface BookReferences {
  eraId: string | null;
  locationId: string | null;
}
