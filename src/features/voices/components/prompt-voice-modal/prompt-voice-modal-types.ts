import type { VoiceAge, VoiceGender } from '@/types/voice';
import type { PreviewCandidate } from '@/apis/voice-api';

// Modal state machine:
//   idle       — form only, no previews yet
//   generating — awaiting generate response; form disabled
//   audition   — previews rendered inline below Generate; form editable
//   saving     — awaiting save response; form + Generate disabled
export type PromptVoiceModalStep = 'idle' | 'generating' | 'audition' | 'saving';

export interface PromptVoiceFormState {
  name: string;
  gender: VoiceGender;
  age: VoiceAge;
  language: string;
  accent: string;
  description: string;
  tags: string;
  loudness: number; // 0..1
  guidance: number; // 0..1
}

export const DEFAULT_PROMPT_VOICE_FORM: PromptVoiceFormState = {
  name: '',
  gender: 0,
  age: 0,
  language: 'en_US',
  accent: 'neutral',
  description: '',
  tags: '',
  loudness: 0.5,
  guidance: 0.75,
};

export type { PreviewCandidate };
