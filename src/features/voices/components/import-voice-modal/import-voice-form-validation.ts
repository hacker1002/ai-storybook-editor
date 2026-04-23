import { SUPPORTED_LANGUAGES } from '@/constants/config-constants';
import type { ImportVoiceFormState } from './import-voice-modal-types';

export interface ImportFormErrors {
  name?: string;
  language?: string;
  accent?: string;
}

export function isSupportedLanguage(code: string | null | undefined): code is string {
  if (!code) return false;
  return SUPPORTED_LANGUAGES.some((l) => l.code === code);
}

export function validateImportForm(
  form: ImportVoiceFormState
): { isValid: boolean; errors: ImportFormErrors } {
  const errors: ImportFormErrors = {};
  const name = form.name.trim();
  if (name.length < 1) errors.name = 'Name is required';
  else if (name.length > 80) errors.name = 'Name must be ≤ 80 characters';
  if (form.language === null) errors.language = 'Please select a language';
  else if (!isSupportedLanguage(form.language))
    errors.language = 'Language not supported. Please select one.';
  if (!form.accent) errors.accent = 'Accent is required';
  return { isValid: Object.keys(errors).length === 0, errors };
}
