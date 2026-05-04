// Resource-agnostic audio types shared between sounds & musics features.
// `Sound`/`SoundsFilterState` aliases are re-exported from `@/types/sound` for
// zero-call-site break in legacy consumers (Phase 4 cleanup).

export type AudioSource = 0 | 1; // 0=upload, 1=generate
export type AudioType = 'loop' | 'one_shot';
export type AudioTableName = 'sounds' | 'musics';

export interface AudioResource {
  id: string;
  name: string;
  description: string | null;
  mediaUrl: string;
  loop: boolean;
  duration: number; // ms
  influence: number | null;
  tags: string | null;
  source: AudioSource;
  createdAt: string;
}

export interface AudioRow {
  id: string;
  name: string;
  description: string | null;
  media_url: string;
  loop: boolean;
  duration: number;
  influence: number | null;
  tags: string | null;
  source: number;
  created_at: string;
}

export interface AudioFilterState {
  search: string;
  source: AudioSource | null;
  type: AudioType | null;
  tags: string[];
  durationRange: [number, number] | null; // [lo, hi] in ms
}

export type AudioActiveModal = 'upload' | 'generate' | null;
