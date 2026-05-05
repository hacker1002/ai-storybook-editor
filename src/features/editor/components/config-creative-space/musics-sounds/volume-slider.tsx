// volume-slider.tsx
// Reusable 0..200% volume slider with debounced commit. Local state drives the
// thumb at 60fps; the external onChange flushes after `debounceMs` of idle.

import * as React from 'react';

import { Slider } from '@/components/ui/slider';
import {
  VOLUME_MIN,
  VOLUME_MAX,
  VOLUME_STEP,
} from '@/constants/config-constants';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { useDebouncedCallback } from '@/utils/use-debounced-callback';

const log = createLogger('Editor', 'VolumeSlider');

export interface VolumeSliderProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  debounceMs?: number;
  ariaLabel?: string;
  className?: string;
}

export function VolumeSlider({
  value,
  onChange,
  min = VOLUME_MIN,
  max = VOLUME_MAX,
  step = VOLUME_STEP,
  disabled = false,
  debounceMs = 100,
  ariaLabel,
  className,
}: VolumeSliderProps) {
  const [localValue, setLocalValue] = React.useState<number>(value);
  const pendingCommitRef = React.useRef(false);

  // Reconcile from prop when external value changes AND no pending debounced commit.
  React.useEffect(() => {
    if (pendingCommitRef.current) return;
    setLocalValue(value);
  }, [value]);

  const debouncedCommit = useDebouncedCallback((next: number) => {
    pendingCommitRef.current = false;
    log.debug('debouncedCommit', 'flush', { value: next });
    onChange(next);
  }, debounceMs);

  const handleSliderChange = React.useCallback(
    (values: number[]) => {
      const next = values[0] ?? 0;
      setLocalValue(next);
      pendingCommitRef.current = true;
      debouncedCommit(next);
    },
    [debouncedCommit],
  );

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Slider
        value={[localValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleSliderChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="flex-1"
      />
      <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">
        {Math.round(localValue * 100)}%
      </span>
    </div>
  );
}
