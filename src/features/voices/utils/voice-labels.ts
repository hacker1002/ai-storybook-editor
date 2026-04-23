import type { VoiceAge, VoiceGender, VoiceType } from '@/types/voice';

export { getLanguageName } from '@/constants/config-constants';

export const GENDER_LABEL: Record<VoiceGender, string> = {
  0: 'Female',
  1: 'Male',
};

export const AGE_LABEL: Record<VoiceAge, string> = {
  0: 'Young',
  1: 'Middle',
  2: 'Old',
};

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
