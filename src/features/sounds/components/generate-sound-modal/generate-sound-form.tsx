import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { NumberStepper } from '@/components/ui/number-stepper';
import { createLogger } from '@/utils/logger';
import type { GenerateSoundFormState } from './generate-sound-modal-types';
import { validateGenerateSoundForm } from './generate-sound-form-validation';

const log = createLogger('Sounds', 'GenerateSoundForm');

interface GenerateSoundFormProps {
  value: GenerateSoundFormState;
  onChange: (next: GenerateSoundFormState) => void;
  disabled: boolean;
  showValidation?: boolean;
}

interface FieldBlockProps {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  rightSlot?: ReactNode;
}

function FieldBlock({ id, label, required, error, children, rightSlot }: FieldBlockProps) {
  const errorId = id && error ? `${id}-error` : undefined;
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

export function GenerateSoundForm({
  value,
  onChange,
  disabled,
  showValidation,
}: GenerateSoundFormProps) {
  const uid = useId();
  const errors = showValidation ? validateGenerateSoundForm(value).errors : {};

  const updateField = <K extends keyof GenerateSoundFormState>(
    key: K,
    next: GenerateSoundFormState[K]
  ) => {
    log.debug('updateField', 'change', { field: String(key) });
    onChange({ ...value, [key]: next });
  };

  const nameId = `${uid}-name`;
  const tagsId = `${uid}-tags`;
  const descriptionId = `${uid}-description`;
  const loopId = `${uid}-loop`;
  const durationAutoId = `${uid}-duration-auto`;
  const influenceId = `${uid}-influence`;

  const descLen = value.description.trim().length;
  const influencePct = Math.round(value.promptInfluence * 100);

  return (
    <div className="space-y-5">
      <FieldBlock id={nameId} label="Name" required error={errors.name}>
        <Input
          id={nameId}
          value={value.name}
          onChange={(e) => updateField('name', e.target.value)}
          maxLength={255}
          disabled={disabled}
          autoFocus
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          placeholder="e.g., Magic Sparkle"
        />
      </FieldBlock>

      <FieldBlock id={tagsId} label="Tags">
        <Input
          id={tagsId}
          value={value.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          disabled={disabled}
          placeholder="ambient, magic, loop (comma-separated)"
        />
      </FieldBlock>

      <FieldBlock
        id={descriptionId}
        label="Description"
        required
        error={errors.description}
        rightSlot={
          <span className="text-xs text-muted-foreground tabular-nums">
            {descLen}/500
          </span>
        }
      >
        <Textarea
          id={descriptionId}
          value={value.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={500}
          disabled={disabled}
          rows={3}
          className="min-h-[88px]"
          aria-required="true"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          placeholder="Describe the sound you want to generate..."
        />
      </FieldBlock>

      <div className="flex items-center justify-between">
        <Label htmlFor={loopId} className="text-xs font-medium uppercase tracking-wide">
          Loop
        </Label>
        <Switch
          id={loopId}
          checked={value.loop}
          onCheckedChange={(b) => updateField('loop', b)}
          aria-label="Loop"
          disabled={disabled}
        />
      </div>

      <FieldBlock label="Duration" error={errors.durationSecs}>
        <div className="flex items-center gap-3">
          <Switch
            id={durationAutoId}
            checked={value.durationAuto}
            onCheckedChange={(b) => updateField('durationAuto', b)}
            aria-label="Auto duration"
            disabled={disabled}
          />
          <Label htmlFor={durationAutoId} className="text-sm">
            Auto
          </Label>
          {!value.durationAuto ? (
            <div className="flex items-center gap-2 ml-auto">
              <NumberStepper
                value={value.durationSecs ?? 10}
                min={0.5}
                max={22}
                step={0.5}
                onChange={(v) => updateField('durationSecs', v)}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground">seconds (0.5-22)</span>
            </div>
          ) : null}
        </div>
      </FieldBlock>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={influenceId} className="text-xs font-medium uppercase tracking-wide">
            Prompt Influence
          </Label>
          <span className="text-xs text-muted-foreground tabular-nums">{influencePct}%</span>
        </div>
        <Slider
          id={influenceId}
          min={0}
          max={1}
          step={0.01}
          value={[value.promptInfluence]}
          onValueChange={(arr) => updateField('promptInfluence', arr[0] ?? 0)}
          aria-valuetext={`${influencePct} percent`}
          disabled={disabled}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
