import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NumberStepper } from '@/components/ui/number-stepper';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { FinetuneDropdown } from './finetune-dropdown';
import { validateGenerateMusicForm } from './generate-music-form-validation';
import {
  DESCRIPTION_MAX,
  DURATION_MAX_SECS,
  DURATION_MIN_SECS,
  NAME_MAX,
  type GenerateMusicFormState,
} from './generate-music-modal-types';

const log = createLogger('Musics', 'GenerateMusicForm');

export interface GenerateMusicFormProps {
  value: GenerateMusicFormState;
  onChange: (next: GenerateMusicFormState) => void;
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

export function GenerateMusicForm({
  value,
  onChange,
  disabled,
  showValidation,
}: GenerateMusicFormProps) {
  const uid = useId();
  const errors = showValidation ? validateGenerateMusicForm(value).errors : {};

  const updateField = <K extends keyof GenerateMusicFormState>(
    key: K,
    next: GenerateMusicFormState[K],
  ) => {
    log.debug('updateField', 'change', { field: String(key) });
    onChange({ ...value, [key]: next });
  };

  const nameId = `${uid}-name`;
  const tagsId = `${uid}-tags`;
  const descriptionId = `${uid}-description`;
  const finetuneId = `${uid}-finetune`;
  const loopId = `${uid}-loop`;
  const durationAutoId = `${uid}-duration-auto`;

  const descLen = value.description.trim().length;

  return (
    <div className="space-y-5">
      <FieldBlock id={nameId} label="Name" required={false} error={errors.name}>
        <Input
          id={nameId}
          value={value.name}
          onChange={(e) => updateField('name', e.target.value)}
          maxLength={NAME_MAX}
          disabled={disabled}
          autoFocus
          placeholder="e.g., Cinematic Adventure"
        />
      </FieldBlock>

      <FieldBlock id={tagsId} label="Tags" error={errors.tags}>
        <Input
          id={tagsId}
          value={value.tags}
          onChange={(e) => updateField('tags', e.target.value)}
          disabled={disabled}
          placeholder="cinematic, orchestral, intro (comma-separated)"
        />
      </FieldBlock>

      <FieldBlock
        id={descriptionId}
        label="Description"
        required
        error={errors.description}
        rightSlot={
          <span className="text-xs text-muted-foreground tabular-nums">
            {descLen}/{DESCRIPTION_MAX}
          </span>
        }
      >
        <Textarea
          id={descriptionId}
          value={value.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={DESCRIPTION_MAX}
          disabled={disabled}
          rows={3}
          className="min-h-[88px]"
          aria-required="true"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          placeholder="Describe the music you want to generate..."
        />
      </FieldBlock>

      <FieldBlock id={finetuneId} label="Finetune" error={errors.finetuneId}>
        <FinetuneDropdown
          value={value.finetuneId}
          onChange={(slug) => updateField('finetuneId', slug)}
          disabled={disabled}
        />
      </FieldBlock>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label htmlFor={loopId} className="text-xs font-medium uppercase tracking-wide">
            Loop
          </Label>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Loop info"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[260px]">
                Loops during playback. Note: track may have audible seam at boundary
                (not seamless audio loop).
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
                value={value.durationSecs ?? 30}
                min={DURATION_MIN_SECS}
                max={DURATION_MAX_SECS}
                step={1}
                onChange={(v) => updateField('durationSecs', v)}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground">
                seconds ({DURATION_MIN_SECS}-{DURATION_MAX_SECS})
              </span>
            </div>
          ) : null}
        </div>
      </FieldBlock>
    </div>
  );
}
