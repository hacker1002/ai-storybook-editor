// Form & result types for the GenerateSoundModal flow.
// Reducer logic now lives in the shared `useGenerateModalFlow` hook.

export interface GenerateSoundFormState {
  name: string;
  tags: string;
  description: string;
  loop: boolean;
  durationAuto: boolean;
  durationSecs: number | null;
  promptInfluence: number;
}

export const DEFAULT_GENERATE_SOUND_FORM: GenerateSoundFormState = {
  name: '',
  tags: '',
  description: '',
  loop: false,
  durationAuto: true,
  durationSecs: null,
  promptInfluence: 0.3,
};

export interface SoundGenerationResult {
  soundUrl: string;
  durationSecs: number;
  mediaType: 'audio/mpeg' | 'audio/wav';
}
