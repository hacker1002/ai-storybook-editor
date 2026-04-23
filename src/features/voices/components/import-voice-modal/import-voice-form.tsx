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
import type { ImportVoiceFormState } from './import-voice-modal-types';
import { validateImportForm } from './import-voice-form-validation';

const log = createLogger('Voices', 'ImportVoiceForm');

// Sentinel for <Select> items — shadcn Select doesn't accept null/empty string values.
const UNSET = '__unset';

interface GenderItem {
  value: string;
  label: string;
  raw: VoiceGender;
}

interface AgeItem {
  value: string;
  label: string;
  raw: VoiceAge;
}

const GENDER_ITEMS: GenderItem[] = [
  { value: UNSET, label: 'Select...', raw: null },
  { value: '0',   label: 'Female',    raw: 0 },
  { value: '1',   label: 'Male',      raw: 1 },
];

const AGE_ITEMS: AgeItem[] = [
  { value: UNSET, label: 'Select...',    raw: null },
  { value: '0',   label: 'Young',        raw: 0 },
  { value: '1',   label: 'Middle-aged',  raw: 1 },
  { value: '2',   label: 'Old',          raw: 2 },
];

const ACCENT_OPTIONS = [
  { value: 'neutral',      label: 'Neutral'       },
  { value: 'american',     label: 'American'      },
  { value: 'british',      label: 'British'       },
  { value: 'australian',   label: 'Australian'    },
  { value: 'canadian',     label: 'Canadian'      },
  { value: 'indian',       label: 'Indian'        },
  { value: 'irish',        label: 'Irish'         },
  { value: 'scottish',     label: 'Scottish'      },
  { value: 'southern_us',  label: 'Southern US'   },
  { value: 'northern',     label: 'Northern'      },
  { value: 'southern',     label: 'Southern'      },
] as const;

interface ImportVoiceFormProps {
  value: ImportVoiceFormState;
  onChange: (next: ImportVoiceFormState) => void;
  disabled: boolean;
  showValidation?: boolean;
}

interface FieldBlockProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

function FieldBlock({ id, label, required, error, children }: FieldBlockProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide">
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ImportVoiceForm({
  value,
  onChange,
  disabled,
  showValidation,
}: ImportVoiceFormProps) {
  const uid = useId();
  const errors = showValidation ? validateImportForm(value).errors : {};

  const updateField = <K extends keyof ImportVoiceFormState>(
    key: K,
    next: ImportVoiceFormState[K]
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

  const genderValue = value.gender === null ? UNSET : String(value.gender);
  const ageValue = value.age === null ? UNSET : String(value.age);
  const languageValue = value.language === null ? UNSET : value.language;

  return (
    <div className="space-y-4">
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
          placeholder="e.g. George"
        />
      </FieldBlock>

      <div className="grid grid-cols-2 gap-4">
        <FieldBlock id={genderId} label="Gender">
          <Select
            value={genderValue}
            onValueChange={(v) => {
              const item = GENDER_ITEMS.find((i) => i.value === v);
              updateField('gender', item ? item.raw : null);
            }}
            disabled={disabled}
          >
            <SelectTrigger id={genderId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDER_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock id={ageId} label="Age">
          <Select
            value={ageValue}
            onValueChange={(v) => {
              const item = AGE_ITEMS.find((i) => i.value === v);
              updateField('age', item ? item.raw : null);
            }}
            disabled={disabled}
          >
            <SelectTrigger id={ageId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldBlock id={languageId} label="Language" required error={errors.language}>
          <Select
            value={languageValue}
            onValueChange={(v) => updateField('language', v === UNSET ? null : v)}
            disabled={disabled}
          >
            <SelectTrigger
              id={languageId}
              aria-invalid={Boolean(errors.language)}
              aria-describedby={errors.language ? `${languageId}-error` : undefined}
            >
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Select...</SelectItem>
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

      <FieldBlock id={descriptionId} label="Description">
        <Textarea
          id={descriptionId}
          value={value.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={1000}
          disabled={disabled}
          className="min-h-[80px]"
          placeholder="Optional description"
        />
      </FieldBlock>

      <FieldBlock id={tagsId} label="Tags (comma-separated)">
        <Input
          id={tagsId}
          value={value.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          disabled={disabled}
          placeholder="imported, elevenlabs"
        />
      </FieldBlock>
    </div>
  );
}
