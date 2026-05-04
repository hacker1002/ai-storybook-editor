import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { formatDurationMs } from '@/features/sounds/utils/sound-labels';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'DurationFilter');

interface DurationFilterProps {
  /** Inclusive [lo, hi] bounds (in ms) of the available data set. */
  bounds: [number, number];
  /** Current selected range (in ms). */
  value: [number, number];
  onChange: (next: [number, number]) => void;
}

export function DurationFilter({ bounds, value, onChange }: DurationFilterProps) {
  const [open, setOpen] = useState(false);
  // Local mirror so dragging stays smooth — emit on commit / change.
  // Re-sync from prop via render-time key derived from value bounds.
  const [draft, setDraft] = useState<[number, number]>(value);
  const [lastValueKey, setLastValueKey] = useState<string>(`${value[0]}:${value[1]}`);
  const incomingKey = `${value[0]}:${value[1]}`;
  if (incomingKey !== lastValueKey) {
    // External value changed (e.g. filter reset) — adopt.
    setLastValueKey(incomingKey);
    setDraft(value);
  }

  const [minBound, maxBound] = bounds;
  const disabled = minBound === maxBound;
  const [lo, hi] = draft;

  const isAtBounds = value[0] === minBound && value[1] === maxBound;
  const triggerLabel = isAtBounds
    ? 'Duration'
    : `Duration · ${formatDurationMs(value[0])}–${formatDurationMs(value[1])}`;

  const handleSliderChange = (next: number[]) => {
    if (next.length < 2) return;
    const a = Math.min(next[0], next[1]);
    const b = Math.max(next[0], next[1]);
    setDraft([a, b]);
  };

  const handleCommit = (next: number[]) => {
    if (next.length < 2) return;
    const a = Math.min(next[0], next[1]);
    const b = Math.max(next[0], next[1]);
    log.debug('commit', 'range committed', { a, b });
    onChange([a, b]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={disabled}
          aria-label="Filter by duration"
        >
          <Clock className="h-4 w-4 opacity-70" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
          Filter by duration
        </h4>
        <Slider
          min={minBound}
          max={maxBound}
          step={1000}
          value={[lo, hi]}
          onValueChange={handleSliderChange}
          onValueCommit={handleCommit}
          aria-label="Duration range"
          aria-valuetext={`From ${formatDurationMs(lo)} to ${formatDurationMs(hi)}`}
        />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{formatDurationMs(lo)}</span>
          <span>{formatDurationMs(hi)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
