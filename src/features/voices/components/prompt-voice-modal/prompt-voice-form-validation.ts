import type { PromptVoiceFormState } from './prompt-voice-modal-types';

export interface PromptVoiceFormValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof PromptVoiceFormState, string>>;
}

export function validatePromptVoiceForm(
  form: PromptVoiceFormState
): PromptVoiceFormValidationResult {
  const errors: Partial<Record<keyof PromptVoiceFormState, string>> = {};

  const nameLen = form.name.trim().length;
  if (nameLen < 1 || nameLen > 80) {
    errors.name = 'Tên 1-80 ký tự';
  }

  const descTrimmed = form.description.trim();
  if (descTrimmed.length < 20 || descTrimmed.length > 1000) {
    errors.description = `Mô tả 20-1000 ký tự (${descTrimmed.length}/20)`;
  }

  if (!form.language) errors.language = 'Chọn ngôn ngữ';
  if (!form.accent) errors.accent = 'Chọn accent';

  if (form.tags) {
    const items = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (items.length > 10 || form.tags.length > 200) {
      errors.tags = 'Tối đa 10 tags, tổng ≤ 200 ký tự';
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
