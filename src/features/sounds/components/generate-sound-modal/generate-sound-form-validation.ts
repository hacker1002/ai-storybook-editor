import type { GenerateSoundFormState } from './generate-sound-modal-types';

export interface GenerateSoundFormValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof GenerateSoundFormState, string>>;
}

const NAME_MIN = 1;
const NAME_MAX = 255;
const DESC_MIN = 10;
const DESC_MAX = 500;
const DURATION_MIN_SECS = 0.5;
const DURATION_MAX_SECS = 22;
const INFLUENCE_MIN = 0;
const INFLUENCE_MAX = 1;

export function validateGenerateSoundForm(
  form: GenerateSoundFormState
): GenerateSoundFormValidationResult {
  const errors: Partial<Record<keyof GenerateSoundFormState, string>> = {};

  const nameLen = form.name.trim().length;
  if (nameLen < NAME_MIN || nameLen > NAME_MAX) {
    errors.name = `Name ${NAME_MIN}-${NAME_MAX} chars required`;
  }

  const descLen = form.description.trim().length;
  if (descLen < DESC_MIN) {
    errors.description = `Min ${DESC_MIN} chars (${descLen}/${DESC_MIN})`;
  } else if (descLen > DESC_MAX) {
    errors.description = `Max ${DESC_MAX} chars`;
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

  if (form.promptInfluence < INFLUENCE_MIN || form.promptInfluence > INFLUENCE_MAX) {
    errors.promptInfluence = `Must be ${INFLUENCE_MIN}-${INFLUENCE_MAX}`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
