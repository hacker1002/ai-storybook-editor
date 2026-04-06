// share-preview-types.ts - Types for share preview feature (public, unauthenticated)

// === Status ===
export type SharePreviewStatus =
  | 'loading'
  | 'requires_passcode'
  | 'ready'
  | 'not_found'
  | 'error';

// === Share Config ===
export interface ShareConfig {
  name: string;
  editions: { classic?: boolean; dynamic?: boolean; interactive?: boolean };
  languages: { name: string; code: string }[];
}

// === Book Preview Data ===
export interface BookPreviewData {
  id: string;
  title: string;
  cover: { thumbnail_url?: string; normal_url?: string };
  dimension: number;
  book_type: number;
  original_language: string;
  typography: Record<string, unknown>;
  branch: Record<string, unknown>;
  shape: Record<string, unknown>;
  background_music: { title?: string; media_url?: string };
}

// === Snapshot Preview Data ===
export interface SnapshotPreviewData {
  id: string;
  version: string;
  illustration: {
    spreads: Record<string, unknown>[];
    sections: { id: string; title: string; start_spread_id: string; end_spread_id: string; next_spread_id?: string | null }[];
  };
}

// === API Result (discriminated union) ===
export type SharePreviewResult =
  | { status: 'requires_passcode'; name: string }
  | { status: 'ready'; shareConfig: ShareConfig; book: BookPreviewData; snapshot: SnapshotPreviewData | null }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'invalid_passcode' }
  | { status: 'rate_limited' };
