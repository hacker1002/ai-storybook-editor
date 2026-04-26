// animation-settings-panel.tsx - Panel for configuring animation effect type and options

import type { ResolvedAnimation, SpreadAnimation } from '@/types/animation-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'AnimationSettingsPanel');
import { EFFECT_OPTIONS_MAP, TRIGGER_TYPE_LABELS } from '@/constants/animation-constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { EffectTypeGrid } from './effect-type-grid';

interface AnimationSettingsPanelProps {
  animation: ResolvedAnimation;
  onEffectTypeChange: (newEffectType: number) => void;
  onTriggerTypeChange: (trigger: SpreadAnimation['trigger_type']) => void;
  onClickLoopChange: (value: number) => void;
  onEffectOptionChange: (field: string, value: number | string) => void;
  onMustCompleteChange: (value: boolean) => void;
  targetHasAudio?: boolean;
}

// ---- EffectOptionsForm ----

interface GeometryInputsProps {
  geometry: NonNullable<SpreadAnimation['effect']['geometry']>;
  onChange: (field: string, value: number | string) => void;
}

function GeometryInputs({ geometry, onChange }: GeometryInputsProps) {
  const fields: { key: 'x' | 'y' | 'w' | 'h'; label: string }[] = [
    { key: 'x', label: 'X' },
    { key: 'y', label: 'Y' },
    { key: 'w', label: 'W' },
    { key: 'h', label: 'H' },
  ];

  return (
    <div className="col-span-2 space-y-1">
      <Label className="text-xs">Path Geometry (%)</Label>
      <div className="grid grid-cols-4 gap-1.5">
        {fields.map(({ key, label }) => (
          <div key={key} className="space-y-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Input
              type="number"
              step={1}
              min={0}
              max={100}
              value={geometry[key]}
              onChange={(e) => {
                const next = { ...geometry, [key]: Number(e.target.value) };
                onChange('geometry', next as unknown as number);
              }}
              className="h-7 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  step: number;
  min: number;
  max?: number;
  unit?: string;
  field: string;
  onChange: (field: string, value: number | string) => void;
}

function NumberField({ label, value, step, min, max, unit, field, onChange }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{unit ? ` (${unit})` : ''}</Label>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? 0}
        onChange={(e) => onChange(field, Number(e.target.value))}
        className="h-7 text-xs"
      />
    </div>
  );
}

interface LoopFieldProps {
  value: number | undefined;
  onChange: (field: string, value: number | string) => void;
}

function LoopField({ value, onChange }: LoopFieldProps) {
  const isInfinite = value === -1;
  // When toggling off infinite, restore to 1 (a sensible default play count).
  const numericValue = isInfinite ? 1 : (value ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Loop</Label>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="loop-infinite" className="text-[10px] text-muted-foreground">
            Infinite
          </Label>
          <Switch
            id="loop-infinite"
            checked={isInfinite}
            onCheckedChange={(checked) => onChange('loop', checked ? -1 : 1)}
            className="scale-75"
          />
        </div>
      </div>
      {isInfinite ? (
        <div className="flex h-7 items-center justify-center rounded-md border border-input bg-muted text-xs text-muted-foreground">
          ∞
        </div>
      ) : (
        <Input
          type="number"
          step={1}
          min={0}
          value={numericValue}
          onChange={(e) => onChange('loop', Number(e.target.value))}
          className="h-7 text-xs"
        />
      )}
    </div>
  );
}

interface DirectionSelectProps {
  value: string | undefined;
  onChange: (field: string, value: number | string) => void;
}

const DIRECTION_ICONS = {
  left:  <ArrowLeft  className="h-3.5 w-3.5" />,
  right: <ArrowRight className="h-3.5 w-3.5" />,
  up:    <ArrowUp    className="h-3.5 w-3.5" />,
  down:  <ArrowDown  className="h-3.5 w-3.5" />,
} as const;

function DirectionSelect({ value, onChange }: DirectionSelectProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Direction</Label>
      <ToggleGroup
        type="single"
        value={value ?? 'left'}
        onValueChange={(v) => { if (v) onChange('direction', v as string); }}
        className="justify-start gap-0.5"
      >
        {(Object.keys(DIRECTION_ICONS) as Array<keyof typeof DIRECTION_ICONS>).map((d) => (
          <ToggleGroupItem key={d} value={d} className="h-7 w-7 p-0">
            {DIRECTION_ICONS[d]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

interface EffectOptionsFormProps {
  animation: ResolvedAnimation;
  onTriggerTypeChange: (trigger: SpreadAnimation['trigger_type']) => void;
  onClickLoopChange: (value: number) => void;
  onEffectOptionChange: (field: string, value: number | string) => void;
  onMustCompleteChange: (value: boolean) => void;
}

function EffectOptionsForm({
  animation,
  onTriggerTypeChange,
  onClickLoopChange,
  onEffectOptionChange,
  onMustCompleteChange,
}: EffectOptionsFormProps) {
  const { effect, trigger_type, click_loop, must_complete } = animation.animation;
  const visibleOptions = EFFECT_OPTIONS_MAP[effect.type] ?? [];
  const showClickLoop = trigger_type === 'on_click';

  return (
    <div className="space-y-3">
      {/* Trigger dropdown - always visible */}
      <div className="space-y-1">
        <Label className="text-xs">Trigger</Label>
        <Select
          value={trigger_type}
          onValueChange={(v) => onTriggerTypeChange(v as SpreadAnimation['trigger_type'])}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TRIGGER_TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Click loop - only when trigger is on_click */}
      {showClickLoop && (
        <div className="space-y-1">
          <Label className="text-xs">Click Loop</Label>
          <Input
            type="number"
            step={1}
            min={0}
            value={click_loop ?? 0}
            onChange={(e) => onClickLoopChange(Number(e.target.value))}
            className="h-7 text-xs"
          />
        </div>
      )}

      {/* Must complete toggle */}
      <div className="flex items-center justify-between">
        <Label htmlFor={`must-complete-${animation.originalIndex}`} className="text-xs">
          Must Complete
        </Label>
        <Switch
          id={`must-complete-${animation.originalIndex}`}
          checked={must_complete ?? false}
          onCheckedChange={onMustCompleteChange}
          className="scale-75"
        />
      </div>

      {/* Dynamic effect options */}
      {/* Note: delay/duration stored in ms, displayed in seconds */}
      <div className="grid grid-cols-2 gap-2">
        {visibleOptions.includes('delay') && (
          <NumberField
            label="Delay"
            field="delay"
            value={(effect.delay ?? 0) / 1000}
            step={0.1}
            min={0}
            unit="s"
            onChange={(field, val) => onEffectOptionChange(field, Math.round(Number(val) * 1000))}
          />
        )}
        {visibleOptions.includes('duration') && (
          <NumberField
            label="Duration"
            field="duration"
            value={(effect.duration ?? 0) / 1000}
            step={0.1}
            min={0}
            unit="s"
            onChange={(field, val) => onEffectOptionChange(field, Math.round(Number(val) * 1000))}
          />
        )}
        {visibleOptions.includes('direction') && (
          <DirectionSelect value={effect.direction} onChange={onEffectOptionChange} />
        )}
        {visibleOptions.includes('amount') && (
          <NumberField
            label="Amount"
            field="amount"
            value={effect.amount}
            step={0.1}
            min={0}
            onChange={onEffectOptionChange}
          />
        )}
        {visibleOptions.includes('loop') && (
          <LoopField value={effect.loop} onChange={onEffectOptionChange} />
        )}
        {visibleOptions.includes('geometry') && effect.geometry && (
          <GeometryInputs
            geometry={effect.geometry}
            onChange={onEffectOptionChange}
          />
        )}
      </div>
    </div>
  );
}

// ---- Main Panel ----

export function AnimationSettingsPanel({
  animation,
  onEffectTypeChange,
  onTriggerTypeChange,
  onClickLoopChange,
  onEffectOptionChange,
  onMustCompleteChange,
  targetHasAudio,
}: AnimationSettingsPanelProps) {
  log.debug('AnimationSettingsPanel', 'render', { effectType: animation.animation.effect.type, triggerType: animation.animation.trigger_type });
  return (
    <div className="p-3 space-y-4">
      <EffectTypeGrid
        animation={animation}
        onEffectTypeChange={onEffectTypeChange}
        targetHasAudio={targetHasAudio}
      />
      <EffectOptionsForm
        animation={animation}
        onTriggerTypeChange={onTriggerTypeChange}
        onClickLoopChange={onClickLoopChange}
        onEffectOptionChange={onEffectOptionChange}
        onMustCompleteChange={onMustCompleteChange}
      />
    </div>
  );
}
