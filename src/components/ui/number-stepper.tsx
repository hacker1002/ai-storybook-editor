// number-stepper.tsx - Reusable increment/decrement stepper for numeric values.
// Used in Object Settings (opacity/width/radius) and Narration Settings (font size/line-height/spacing).

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/utils';

export interface NumberStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function NumberStepper({
  value,
  min = 0,
  max = 100,
  step = 1,
  unit,
  onChange,
  disabled = false,
  className,
}: NumberStepperProps) {
  const decrement = () => {
    const next = Math.max(min, parseFloat((value - step).toFixed(10)));
    if (next !== value) onChange(next);
  };

  const increment = () => {
    const next = Math.min(max, parseFloat((value + step).toFixed(10)));
    if (next !== value) onChange(next);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
  };

  return (
    <div className={cn('flex items-center gap-0', className)}>
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || value <= min}
        aria-label="Decrease"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-l border border-r-0 bg-background',
          'text-muted-foreground hover:bg-accent hover:text-foreground',
          'disabled:pointer-events-none disabled:opacity-40'
        )}
      >
        <Minus className="h-3 w-3" />
      </button>

      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={handleInput}
        className={cn(
          'h-7 w-12 border border-x-0 bg-background text-center text-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:opacity-40',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
        )}
      />

      <button
        type="button"
        onClick={increment}
        disabled={disabled || value >= max}
        aria-label="Increase"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-r border border-l-0 bg-background',
          'text-muted-foreground hover:bg-accent hover:text-foreground',
          'disabled:pointer-events-none disabled:opacity-40'
        )}
      >
        <Plus className="h-3 w-3" />
      </button>

      {unit && <span className="ml-1.5 text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}
