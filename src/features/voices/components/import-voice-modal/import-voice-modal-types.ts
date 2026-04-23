import type { VoiceAge, VoiceGender } from '@/types/voice';

// Modal state machine:
//   idle       — waiting for user input, form empty
//   fetching   — debounced API call in-flight for current elevenId
//   ready      — fetch success, form prefilled; user may edit then submit
//   fetch_err  — fetch failed; inline alert shown, form remains empty/editable
//   inserting  — Supabase insert in-flight; dismiss blocked
export type ImportVoiceStep = 'idle' | 'fetching' | 'ready' | 'fetch_err' | 'inserting';

export interface ImportVoiceFormState {
  name: string;
  gender: VoiceGender;         // nullable — ElevenLabs may not expose gender metadata
  age: VoiceAge;               // nullable — ElevenLabs may not expose age metadata
  language: string | null;     // REQUIRED before insert; null until user picks if API didn't provide
  accent: string;              // API fallback 'neutral'
  description: string;
  tags: string;                // raw CSV from API, not truncated
  previewAudioUrl: string | null;
}

export const DEFAULT_IMPORT_FORM: ImportVoiceFormState = {
  name: '',
  gender: null,
  age: null,
  language: null,
  accent: 'neutral',
  description: '',
  tags: '',
  previewAudioUrl: null,
};
