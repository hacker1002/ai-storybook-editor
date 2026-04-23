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
import { Slider } from '@/components/ui/slider';
import { SUPPORTED_LANGUAGES } from '@/constants/config-constants';
import type { VoiceAge, VoiceGender } from '@/types/voice';
import { createLogger } from '@/utils/logger';
import type { PromptVoiceFormState } from './prompt-voice-modal-types';
import { validatePromptVoiceForm } from './prompt-voice-form-validation';

const log = createLogger('Voices', 'PromptVoiceForm');

const GENDER_OPTIONS = [
  { value: 0, label: 'Female' },
  { value: 1, label: 'Male' },
] as const;

const AGE_OPTIONS = [
  { value: 0, label: 'Young' },
  { value: 1, label: 'Middle-aged' },
  { value: 2, label: 'Old' },
] as const;

const ACCENT_OPTIONS = [
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

interface PromptVoiceFormProps {
  value: PromptVoiceFormState;
  onChange: (next: PromptVoiceFormState) => void;
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

interface SliderBlockProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}

function SliderBlock({ id, label, value, onChange, disabled }: SliderBlockProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide">
          {label}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
      </div>
      <Slider
        id={id}
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        onValueChange={(arr) => onChange(arr[0] ?? 0)}
        disabled={disabled}
      />
    </div>
  );
}

export function PromptVoiceForm({
  value,
  onChange,
  disabled,
  showValidation,
}: PromptVoiceFormProps) {
  const uid = useId();
  const errors = showValidation ? validatePromptVoiceForm(value).errors : {};

  const updateField = <K extends keyof PromptVoiceFormState>(
    key: K,
    next: PromptVoiceFormState[K]
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
  const loudnessId = `${uid}-loudness`;
  const guidanceId = `${uid}-guidance`;

  const descTrimmedLen = value.description.trim().length;

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
            onValueChange={(v) => updateField('language', v)}
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
              {ACCENT_OPTIONS.map((o) => (
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
        label="Description / Prompt"
        required
        error={errors.description}
        rightSlot={
          <span className="text-xs text-muted-foreground tabular-nums">
            {descTrimmedLen}/1000
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
          aria-required="true"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          placeholder="A warm, calm narrator for bedtime stories — soft, low-pitched, gentle pacing."
        />
      </FieldBlock>

      <FieldBlock id={tagsId} label="Tags (comma-separated)" error={errors.tags}>
        <Input
          id={tagsId}
          value={value.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          disabled={disabled}
          placeholder="narration, warm, calm"
        />
      </FieldBlock>

      <SliderBlock
        id={loudnessId}
        label="Loudness"
        value={value.loudness}
        onChange={(v) => updateField('loudness', v)}
        disabled={disabled}
      />
      <SliderBlock
        id={guidanceId}
        label="Guidance Scale"
        value={value.guidance}
        onChange={(v) => updateField('guidance', v)}
        disabled={disabled}
      />
    </div>
  );
}
