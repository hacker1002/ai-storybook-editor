// voice-inference-params.tsx
// Stateless shared component for ElevenLabs inference params (speed + 3 sliders + speaker boost + reset).
// Parent owns state; parent also decides debounce strategy before persisting changes.

import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import {
  DEFAULT_INFERENCE_PARAMS,
  SPEED_OPTIONS,
  type VoiceInferenceParamsProps,
  type VoiceInferenceParamsValue,
} from './voice-inference-params.types';

const log = createLogger('Shared', 'VoiceInferenceParams');

type SliderField = 'stability' | 'similarity' | 'exaggeration';

interface LabeledSliderProps {
  label: string;
  leftLabel: string;
  rightLabel: string;
  field: SliderField;
  value: number;
  disabled?: boolean;
  onChange: (field: SliderField, next: number) => void;
}

/** Single labeled slider row (section label above, endpoint labels flanking the slider). */
function LabeledSlider({
  label,
  leftLabel,
  rightLabel,
  field,
  value,
  disabled,
  onChange,
}: LabeledSliderProps) {
  const handleChange = React.useCallback(
    (vals: number[]) => {
      const next = vals[0];
      if (typeof next === 'number' && next !== value) {
        onChange(field, next);
      }
    },
    [field, onChange, value]
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted-foreground">{leftLabel}</span>
        <Slider
          value={[value]}
          min={0}
          max={1}
          step={0.01}
          disabled={disabled}
          onValueChange={handleChange}
          aria-label={label}
          className="flex-1"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{rightLabel}</span>
      </div>
    </div>
  );
}

export function VoiceInferenceParams({
  value,
  onChange,
  onReset,
  showReset = true,
  disabled = false,
  title,
  className,
  omitSpeakerBoost = false,
}: VoiceInferenceParamsProps) {
  // Single emit helper — records a DEBUG log with field + from/to then forwards to parent.
  const emit = React.useCallback(
    <K extends keyof VoiceInferenceParamsValue>(
      field: K,
      next: VoiceInferenceParamsValue[K]
    ) => {
      const prev = value[field];
      if (prev === next) return;
      log.debug('emitChange', 'param change', { field: String(field), from: prev, to: next });
      onChange({ ...value, [field]: next });
    },
    [onChange, value]
  );

  const handleSpeedChange = React.useCallback(
    (v: string | string[]) => {
      const raw = Array.isArray(v) ? v[0] : v;
      if (!raw) return; // ToggleGroup emits '' when user clicks active chip — ignore (speed required).
      const num = Number(raw);
      if (!Number.isFinite(num)) return;
      emit('speed', num);
    },
    [emit]
  );

  const handleSliderChange = React.useCallback(
    (field: SliderField, next: number) => {
      emit(field, next);
    },
    [emit]
  );

  const handleSpeakerBoost = React.useCallback(
    (checked: boolean) => {
      emit('speaker_boost', checked);
    },
    [emit]
  );

  const handleReset = React.useCallback(() => {
    log.info('handleReset', 'reset clicked', { hasCustomReset: Boolean(onReset) });
    if (onReset) {
      onReset();
    } else {
      onChange(DEFAULT_INFERENCE_PARAMS);
    }
  }, [onChange, onReset]);

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {title ? (
        <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
      ) : null}

      {/* SPEED chips */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Speed
        </p>
        <ToggleGroup
          type="single"
          value={String(value.speed)}
          onValueChange={handleSpeedChange}
        >
          {SPEED_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt}
              value={String(opt)}
              className={cn(disabled && 'pointer-events-none opacity-50')}
            >
              {opt}x
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Sliders */}
      <LabeledSlider
        label="Stability"
        leftLabel="More variable"
        rightLabel="More stable"
        field="stability"
        value={value.stability}
        disabled={disabled}
        onChange={handleSliderChange}
      />
      <LabeledSlider
        label="Similarity"
        leftLabel="Low"
        rightLabel="High"
        field="similarity"
        value={value.similarity}
        disabled={disabled}
        onChange={handleSliderChange}
      />
      <LabeledSlider
        label="Style exaggeration"
        leftLabel="None"
        rightLabel="Exaggerated"
        field="exaggeration"
        value={value.exaggeration}
        disabled={disabled}
        onChange={handleSliderChange}
      />

      {/* Speaker boost + reset row.
          When `omitSpeakerBoost` is true, switch is hidden but Reset stays right-aligned. */}
      <div
        className={cn(
          'flex items-center gap-3',
          omitSpeakerBoost ? 'justify-end' : 'justify-between',
        )}
      >
        {omitSpeakerBoost ? null : (
          <label className="flex items-center gap-2">
            <Switch
              checked={value.speaker_boost}
              disabled={disabled}
              onCheckedChange={handleSpeakerBoost}
              aria-label="Speaker boost"
            />
            <span className="text-sm">Speaker boost</span>
          </label>
        )}

        {showReset ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={disabled}
            onClick={handleReset}
            className="h-auto gap-1 px-0 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset values
          </Button>
        ) : null}
      </div>
    </div>
  );
}
