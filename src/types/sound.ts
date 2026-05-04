export type SoundSource = 0 | 1; // 0=upload, 1=generate
export type SoundType = 'loop' | 'one_shot';

export interface Sound {
  id: string;
  name: string;
  description: string | null;
  mediaUrl: string;
  loop: boolean;
  duration: number; // ms
  influence: number | null; // [0,1]; null cho upload
  tags: string | null; // CSV lowercase
  source: SoundSource;
  createdAt: string;
}

export interface SoundsFilterState {
  search: string;
  source: SoundSource | null;
  type: SoundType | null;
  tags: string[];
  durationRange: [number, number] | null; // [lo, hi] in ms
}

export type SoundsActiveModal = 'upload' | 'generate' | null;

export interface SoundRow {
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
