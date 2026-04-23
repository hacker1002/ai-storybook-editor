export type VoiceType = 0 | 1 | 2 | 3; // prompt | clone | remix | import
export type VoiceGender = 0 | 1; // female | male
export type VoiceAge = 0 | 1 | 2; // young | middle | old

export interface Voice {
  id: string;
  name: string;
  gender: VoiceGender;
  age: VoiceAge;
  language: string;
  accent: string;
  description: string | null;
  model: string | null;
  elevenId: string | null;
  tags: string | null;
  type: VoiceType;
  previewAudioUrl: string | null;
  sampleAudioUrl: string | null;
  loudness: number | null;
  guidance: number | null;
}

export interface VoicesFilterState {
  search: string;
  type: VoiceType | null;
  gender: VoiceGender | null;
  language: string | null;
  tag: string | null;
}

export type VoicesActiveModal = 'prompt' | 'import' | null;

export interface VoiceRow {
  id: string;
  name: string;
  gender: number;
  age: number;
  language: string;
  accent: string;
  description: string | null;
  model: string | null;
  eleven_id: string | null;
  tags: string | null;
  type: number;
  preview_audio_url: string | null;
  sample_audio_url: string | null;
  loudness: number | null;
  guidance: number | null;
}
