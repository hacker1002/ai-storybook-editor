// Form & result types for the GenerateMusicModal flow.

export interface GenerateMusicFormState {
  name: string;
  tags: string;
  description: string;
  finetuneId: string | null;
  loop: boolean;
  durationAuto: boolean;
  durationSecs: number | null;
}

export interface MusicGenerationResult {
  musicUrl: string;
  durationMs: number;
  mediaType: 'audio/mpeg' | 'audio/wav';
  loop: boolean;
  name: string;
  tags: string;
}

export const INITIAL_GENERATE_MUSIC_FORM: GenerateMusicFormState = {
  name: '',
  tags: '',
  description: '',
  finetuneId: null,
  loop: false,
  durationAuto: true,
  durationSecs: null,
};

export const NAME_MIN = 1;
export const NAME_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;
export const DURATION_MIN_SECS = 3;
export const DURATION_MAX_SECS = 600;
export const TAGS_MAX = 500;
