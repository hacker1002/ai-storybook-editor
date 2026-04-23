import type { VoiceAge, VoiceGender, VoiceType } from '@/types/voice';

export { getLanguageName } from '@/constants/config-constants';

const GENDER_LABELS_NON_NULL: Record<0 | 1, string> = {
  0: 'Female',
  1: 'Male',
};

const AGE_LABELS_NON_NULL: Record<0 | 1 | 2, string> = {
  0: 'Young',
  1: 'Middle',
  2: 'Old',
};

const UNKNOWN_LABEL = 'Unknown';

export function getGenderLabel(g: VoiceGender): string {
  return g === null ? UNKNOWN_LABEL : GENDER_LABELS_NON_NULL[g];
}

export function getAgeLabel(a: VoiceAge): string {
  return a === null ? UNKNOWN_LABEL : AGE_LABELS_NON_NULL[a];
}

// Legacy object accessors — retained for callers that index with a known non-null value.
// For nullable values, prefer the helper functions above.
export const GENDER_LABEL = GENDER_LABELS_NON_NULL;
export const AGE_LABEL = AGE_LABELS_NON_NULL;

export const TYPE_LABEL: Record<VoiceType, string> = {
  0: 'Prompt',
  1: 'Clone',
  2: 'Remix',
  3: 'Import',
};

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}
