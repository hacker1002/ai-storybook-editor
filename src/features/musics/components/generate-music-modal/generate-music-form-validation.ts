import { MUSIC_FINETUNE_SLUGS } from '@/constants/music-finetunes';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  DURATION_MAX_SECS,
  DURATION_MIN_SECS,
  NAME_MAX,
  NAME_MIN,
  TAGS_MAX,
  type GenerateMusicFormState,
} from './generate-music-modal-types';

export interface GenerateMusicFormValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof GenerateMusicFormState, string>>;
}

const TAGS_PATTERN = /^[a-z0-9_,\s]*$/;

export function validateGenerateMusicForm(
  form: GenerateMusicFormState,
): GenerateMusicFormValidationResult {
  const errors: Partial<Record<keyof GenerateMusicFormState, string>> = {};

  const descLen = form.description.trim().length;
  if (descLen < DESCRIPTION_MIN) {
    errors.description = `Min ${DESCRIPTION_MIN} chars (${descLen}/${DESCRIPTION_MIN})`;
  } else if (descLen > DESCRIPTION_MAX) {
    errors.description = `Max ${DESCRIPTION_MAX} chars`;
  }

  if (!form.durationAuto) {
    if (
      form.durationSecs === null ||
      form.durationSecs < DURATION_MIN_SECS ||
      form.durationSecs > DURATION_MAX_SECS
    ) {
      errors.durationSecs = `Must be ${DURATION_MIN_SECS}-${DURATION_MAX_SECS} seconds`;
    }
  }

  if (form.finetuneId !== null && !MUSIC_FINETUNE_SLUGS.has(form.finetuneId)) {
    errors.finetuneId = 'Unknown finetune';
  }

  if (form.tags.length > TAGS_MAX) {
    errors.tags = `Max ${TAGS_MAX} chars`;
  } else if (form.tags.length > 0 && !TAGS_PATTERN.test(form.tags)) {
    errors.tags = 'Lowercase a-z 0-9 _ , space only';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

export function validateGenerateMusicFormForSave(
  form: GenerateMusicFormState,
): GenerateMusicFormValidationResult {
  const base = validateGenerateMusicForm(form);
  const nameLen = form.name.trim().length;
  if (nameLen < NAME_MIN || nameLen > NAME_MAX) {
    base.errors.name = `Name ${NAME_MIN}-${NAME_MAX} chars required`;
  }
  return { isValid: Object.keys(base.errors).length === 0, errors: base.errors };
}
