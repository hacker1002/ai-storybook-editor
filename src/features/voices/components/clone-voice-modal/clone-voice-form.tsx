import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES } from '@/constants/config-constants';
import type { VoiceAge, VoiceGender } from '@/types/voice';
import { createLogger } from '@/utils/logger';
import {
  DEFAULT_ACCENT_VALUE,
  getAccentOptions,
  isValidAccentForLanguage,
} from '@/features/voices/constants';
import {
  AGE_OPTIONS,
  GENDER_OPTIONS,
  type CloneVoiceFormState,
} from './clone-voice-modal-types';
import { validateCloneVoiceForm } from './clone-voice-form-validation';

const log = createLogger('Voices', 'CloneVoiceForm');

export interface CloneVoiceFormProps {
  value: CloneVoiceFormState;
  onChange: (next: CloneVoiceFormState) => void;
  disabled: boolean;
  showValidation?: boolean;
}

interface FieldBlockProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  rightSlot?: ReactNode;
}

function FieldBlock({ id, label, required, error, children, rightSlot }: FieldBlockProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide">
          {label}
          {required ? <span className="text-destructive ml-0.5">*</span> : null}
        </Label>
        {rightSlot}
      </div>
      {children}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CloneVoiceForm({ value, onChange, disabled, showValidation }: CloneVoiceFormProps) {
  const uid = useId();
  // Validation here only echoes field-level errors; cascade is owned by the modal.
  const errors = showValidation ? validateCloneVoiceForm(value, true).errors : {};

  const updateField = <K extends keyof CloneVoiceFormState>(
    key: K,
    next: CloneVoiceFormState[K]
  ) => {
    log.debug('updateField', 'change', { field: String(key) });
    onChange({ ...value, [key]: next });
  };

  const nameId = `${uid}-name`;
  const genderId = `${uid}-gender`;
  const ageId = `${uid}-age`;
  const languageId = `${uid}-language`;
  const accentId = `${uid}-accent`;
  const descriptionId = `${uid}-description`;
  const tagsId = `${uid}-tags`;

  return (
    <div className="space-y-5">
      <FieldBlock id={nameId} label="Name" required error={errors.name}>
        <Input
          id={nameId}
          value={value.name}
          onChange={(e) => updateField('name', e.target.value)}
          maxLength={80}
          disabled={disabled}
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          placeholder="Alex Narrator"
        />
      </FieldBlock>

      <div className="grid grid-cols-2 gap-4">
        <FieldBlock id={genderId} label="Gender">
          <Select
            value={String(value.gender)}
            onValueChange={(v) => updateField('gender', Number(v) as NonNullable<VoiceGender>)}
            disabled={disabled}
          >
            <SelectTrigger id={genderId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock id={ageId} label="Age">
          <Select
            value={String(value.age)}
            onValueChange={(v) => updateField('age', Number(v) as NonNullable<VoiceAge>)}
            disabled={disabled}
          >
            <SelectTrigger id={ageId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldBlock id={languageId} label="Language" required error={errors.language}>
          <Select
            value={value.language}
            onValueChange={(v) => {
              log.debug('updateField', 'change', { field: 'language' });
              const nextAccent = isValidAccentForLanguage(value.accent, v)
                ? value.accent
                : DEFAULT_ACCENT_VALUE;
              onChange({ ...value, language: v, accent: nextAccent });
            }}
            disabled={disabled}
          >
            <SelectTrigger id={languageId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock id={accentId} label="Accent" required error={errors.accent}>
          <Select
            value={value.accent}
            onValueChange={(v) => updateField('accent', v)}
            disabled={disabled}
          >
            <SelectTrigger id={accentId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAccentOptions(value.language).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>

      <FieldBlock
        id={descriptionId}
        label="Description"
        error={errors.description}
        rightSlot={
          <span className="text-xs text-muted-foreground tabular-nums">
            {value.description.length}/1000
          </span>
        }
      >
        <Textarea
          id={descriptionId}
          value={value.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={1000}
          disabled={disabled}
          className="min-h-[96px]"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          placeholder="Optional notes about this voice (timbre, character, intended use)..."
        />
      </FieldBlock>

      <FieldBlock id={tagsId} label="Tags (comma-separated)" error={errors.tags}>
        <Input
          id={tagsId}
          value={value.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(errors.tags)}
          aria-describedby={errors.tags ? `${tagsId}-error` : undefined}
          placeholder="character, custom"
        />
      </FieldBlock>
    </div>
  );
}
