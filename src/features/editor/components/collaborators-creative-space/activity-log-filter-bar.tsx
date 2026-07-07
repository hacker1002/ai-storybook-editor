// ActivityLogFilterBar — the log tab's filter row: a type multi-select (popover),
// a time single-select (popover), and a sort toggle (newest ↔ oldest). Both popovers
// live in a normal side panel (not a high-z modal), so default Radix z-50 /
// click-outside behaviour is correct — no z-index / InteractionLayerStack wiring.

import { ChevronDown, ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { createLogger } from '@/utils/logger';
import { ACTION_OPTIONS, TIME_OPTIONS, type TimeRange } from './activity-log-consts';

const log = createLogger('Editor', 'ActivityLogFilterBar');

interface ActivityLogFilterBarProps {
  typeFilter: number[]; // [] = all types
  timeFilter: TimeRange;
  sortDesc: boolean;
  onTypeChange: (next: number[]) => void;
  onTimeChange: (next: TimeRange) => void;
  onSortToggle: () => void;
}

const TRIGGER_CLASS =
  'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-foreground hover:bg-muted/60';

export function ActivityLogFilterBar({
  typeFilter,
  timeFilter,
  sortDesc,
  onTypeChange,
  onTimeChange,
  onSortToggle,
}: ActivityLogFilterBarProps) {
  const typeLabel = typeFilter.length === 0 ? 'All types' : `${typeFilter.length} selected`;
  const timeLabel = TIME_OPTIONS.find((o) => o.value === timeFilter)?.label ?? 'All time';

  const toggleType = (value: number) => {
    const on = !typeFilter.includes(value);
    log.debug('toggleType', 'type toggled', { value, on });
    onTypeChange(on ? [...typeFilter, value] : typeFilter.filter((v) => v !== value));
  };

  const selectAllTypes = () => {
    log.debug('selectAllTypes', 'clearing type filter');
    onTypeChange([]);
  };

  const SortIcon = sortDesc ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      {/* Type multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={TRIGGER_CLASS} aria-label="Filter by action type">
            <span>{typeLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 space-y-1 p-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted/60">
            <Checkbox checked={typeFilter.length === 0} onCheckedChange={selectAllTypes} aria-label="All types" />
            <span>All types</span>
          </label>
          <Separator />
          {ACTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted/60"
            >
              <Checkbox
                checked={typeFilter.includes(opt.value)}
                onCheckedChange={() => toggleType(opt.value)}
                aria-label={opt.label}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Time single-select */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={TRIGGER_CLASS} aria-label="Filter by time range">
            <span>{timeLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 space-y-0.5 p-2" role="menu">
          {TIME_OPTIONS.map((opt) => {
            const active = opt.value === timeFilter;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  log.debug('selectTime', 'time range selected', { value: opt.value });
                  onTimeChange(opt.value);
                }}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <span>{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      {/* Sort toggle */}
      <button
        type="button"
        onClick={onSortToggle}
        className={`${TRIGGER_CLASS} ml-auto`}
        aria-label={sortDesc ? 'Sort: newest first' : 'Sort: oldest first'}
      >
        <SortIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{sortDesc ? 'Newest first' : 'Oldest first'}</span>
      </button>
    </div>
  );
}
