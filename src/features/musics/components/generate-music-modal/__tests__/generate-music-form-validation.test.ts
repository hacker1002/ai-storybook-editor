import { describe, expect, it } from 'vitest';
import {
  validateGenerateMusicForm,
  validateGenerateMusicFormForSave,
} from '../generate-music-form-validation';
import {
  INITIAL_GENERATE_MUSIC_FORM,
  type GenerateMusicFormState,
} from '../generate-music-modal-types';

const valid: GenerateMusicFormState = {
  ...INITIAL_GENERATE_MUSIC_FORM,
  description: 'A cinematic orchestral piece for the intro scene',
};

describe('validateGenerateMusicForm', () => {
  it('valid form passes', () => {
    expect(validateGenerateMusicForm(valid).isValid).toBe(true);
  });

  it('description below min', () => {
    const r = validateGenerateMusicForm({ ...valid, description: 'short' });
    expect(r.isValid).toBe(false);
    expect(r.errors.description).toMatch(/Min 10 chars/);
  });

  it('description above max (2000)', () => {
    const r = validateGenerateMusicForm({
      ...valid,
      description: 'a'.repeat(2001),
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.description).toMatch(/Max 2000/);
  });

  it('manual duration outside [3,600]', () => {
    const lo = validateGenerateMusicForm({
      ...valid,
      durationAuto: false,
      durationSecs: 2,
    });
    expect(lo.isValid).toBe(false);
    const hi = validateGenerateMusicForm({
      ...valid,
      durationAuto: false,
      durationSecs: 601,
    });
    expect(hi.isValid).toBe(false);
    const ok = validateGenerateMusicForm({
      ...valid,
      durationAuto: false,
      durationSecs: 30,
    });
    expect(ok.isValid).toBe(true);
  });

  it('unknown finetune slug rejected', () => {
    const r = validateGenerateMusicForm({ ...valid, finetuneId: 'bogus_slug' });
    expect(r.isValid).toBe(false);
    expect(r.errors.finetuneId).toBeDefined();
  });

  it('known finetune slug accepted (pop)', () => {
    const r = validateGenerateMusicForm({ ...valid, finetuneId: 'pop' });
    expect(r.isValid).toBe(true);
  });

  it('tags invalid charset', () => {
    const r = validateGenerateMusicForm({
      ...valid,
      tags: 'Bad,UPPERCASE,with-dash',
    });
    expect(r.isValid).toBe(false);
  });

  it('tags valid lowercase csv', () => {
    const r = validateGenerateMusicForm({ ...valid, tags: 'cinematic, orchestral' });
    expect(r.isValid).toBe(true);
  });

  it('save validation requires name', () => {
    const r = validateGenerateMusicFormForSave({ ...valid, name: '' });
    expect(r.isValid).toBe(false);
    expect(r.errors.name).toBeDefined();
  });

  it('save validation passes with name', () => {
    const r = validateGenerateMusicFormForSave({ ...valid, name: 'My Track' });
    expect(r.isValid).toBe(true);
  });
});
