// zoom-control.tsx — Shared zoom slider for modal stage headers (edit-image-modal,
// generate-image-modal, swap-crop-sheet-modal). Single canonical UI:
//
//   [ZoomIn] [-] [────●────] [+] [100%]
//
// One value contract (% as integer, clamped to [min, max]). Caller owns the state and any
// post-change side effects (logging, dispatch). The component clamps -/+ button clicks; the
// Radix Slider already clamps the dragged value.

import { Minus, Plus, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/utils/utils';

export interface ZoomControlProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

const DEFAULT_MIN = 50;
const DEFAULT_MAX = 400;
const DEFAULT_STEP = 5;

export function ZoomControl({
  value,
  onChange,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  step = DEFAULT_STEP,
  className,
}: ZoomControlProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[var(--swap-modal-text-primary)]',
        className,
      )}
    >
      <ZoomIn
        className="h-4 w-4 text-[var(--swap-modal-text-muted)]"
        aria-hidden="true"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Decrease zoom"
        disabled={value <= min}
        onClick={() => onChange(Math.max(value - step, min))}
        className="h-8 w-8 text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label="Zoom level"
        className="w-32"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Increase zoom"
        disabled={value >= max}
        onClick={() => onChange(Math.min(value + step, max))}
        className="h-8 w-8 text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <span
        className="w-12 text-right text-sm font-medium tabular-nums text-[var(--swap-modal-text-secondary)]"
        aria-live="polite"
      >
        {value}%
      </span>
    </div>
  );
}
