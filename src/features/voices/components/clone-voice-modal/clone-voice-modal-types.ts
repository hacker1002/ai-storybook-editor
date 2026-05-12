import type { VoiceAge, VoiceGender } from '@/types/voice';

// Modal state machine:
//   idle      — form editable, no clone in flight
//   cloning   — awaiting POST /api/voice/clone-from-human (15-45s); dismiss hard-blocked
//   clone_err — last call failed; form re-editable, error alert visible
export type CloneVoiceModalStep = 'idle' | 'cloning' | 'clone_err';

export interface CloneVoiceFormState {
  // Cascade selection
  humanId: string | null;
  voiceProfileIndex: number | null;

  // User-editable metadata
  name: string;
  gender: NonNullable<VoiceGender>;
  age: NonNullable<VoiceAge>;
  language: string;
  accent: string;
  description: string;
  tags: string;
}

export const DEFAULT_CLONE_VOICE_FORM: CloneVoiceFormState = {
  humanId: null,
  voiceProfileIndex: null,
  name: '',
  gender: 0,
  age: 0,
  language: 'en_US',
  accent: 'neutral',
  description: '',
  tags: '',
};

// Mirror prompt-voice-form.tsx ACCENT/GENDER/AGE_OPTIONS — keep in sync (extract when Remix modal lands).
export const GENDER_OPTIONS = [
  { value: 0, label: 'Female' },
  { value: 1, label: 'Male' },
] as const;

export const AGE_OPTIONS = [
  { value: 0, label: 'Young' },
  { value: 1, label: 'Middle-aged' },
  { value: 2, label: 'Old' },
] as const;

export const ACCENT_OPTIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'american', label: 'American' },
  { value: 'british', label: 'British' },
  { value: 'australian', label: 'Australian' },
  { value: 'canadian', label: 'Canadian' },
  { value: 'indian', label: 'Indian' },
  { value: 'irish', label: 'Irish' },
  { value: 'scottish', label: 'Scottish' },
  { value: 'southern_us', label: 'Southern US' },
  { value: 'northern', label: 'Northern' },
  { value: 'southern', label: 'Southern' },
] as const;
