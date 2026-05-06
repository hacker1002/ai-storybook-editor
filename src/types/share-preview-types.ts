// share-preview-types.ts - Types for share preview feature (public, unauthenticated)
import type { PageNumberingSettings } from '@/types/editor';

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

// === Playback Settings (denormalized by FastAPI for player no-roundtrip) ===
export interface ShareMediaRef {
  id: string;
  media_url: string;
  name?: string;
}

export interface ShareVoiceMinimal {
  id: string;
  name?: string;
  preview_audio_url?: string;
}

export interface ShareSoundSetting {
  transition?: ShareMediaRef | null;
  true?: ShareMediaRef | null;
  wrong?: ShareMediaRef | null;
  volume_scale: number;
}

export interface ShareMusicSetting {
  background?: ShareMediaRef | null;
  volume_scale: number;
}

// Narrator JSONB: per-language voice entries + top-level volume_scale.
export interface ShareNarratorLanguageEntry {
  voice_id?: string | null;
  media_url?: string;
  voice?: ShareVoiceMinimal | null;
}

export type ShareNarratorSetting = {
  volume_scale?: number;
} & {
  [languageCode: string]: ShareNarratorLanguageEntry | number | undefined;
};

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
  template_layout?: { page_numbering?: PageNumberingSettings } | null;
  // Denormalized playback settings — added by FastAPI port (2026-05-06).
  narrator?: ShareNarratorSetting;
  effects?: Record<string, unknown>;
  sound?: ShareSoundSetting;
  music?: ShareMusicSetting;
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
