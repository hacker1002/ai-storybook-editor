import { SUPPORTED_LANGUAGES } from '@/constants/config-constants';
import type { VoiceAge } from '@/types/voice';
import type { CloneVoiceFormState } from './clone-voice-modal-types';

// Boundaries per design § 4.1 — match ElevenLabs label "young adult / 30-55 / 55+".
export function deriveAgeEnumFromVoiceProfile(rawAge: number): NonNullable<VoiceAge> {
  if (rawAge < 30) return 0;
  if (rawAge < 55) return 1;
  return 2;
}

export interface CloneVoiceFormValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof CloneVoiceFormState | 'cascade', string>>;
}

export function validateCloneVoiceForm(
  form: CloneVoiceFormState,
  hasResolvedRecordUrl: boolean
): CloneVoiceFormValidationResult {
  const errors: Partial<Record<keyof CloneVoiceFormState | 'cascade', string>> = {};

  if (form.humanId === null || form.voiceProfileIndex === null) {
    errors.cascade = 'Select a human and a voice profile';
  } else if (!hasResolvedRecordUrl) {
    errors.cascade = 'Voice profile has no record URL (refresh Humans library)';
  }

  const nameLen = form.name.trim().length;
  if (nameLen < 1 || nameLen > 80) {
    errors.name = 'Name must be 1-80 characters';
  }

  if (!SUPPORTED_LANGUAGES.some((l) => l.code === form.language)) {
    errors.language = 'Select a language';
  }

  if (!form.accent) errors.accent = 'Select an accent';

  if (form.description.length > 1000) {
    errors.description = 'Description max 1000 characters';
  }

  if (form.tags) {
    const items = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (items.length > 10 || form.tags.length > 200) {
      errors.tags = 'Max 10 tags, total ≤ 200 characters';
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
