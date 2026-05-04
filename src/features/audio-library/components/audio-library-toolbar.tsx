import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagsFilter } from './tags-filter';
import { DurationFilter } from './duration-filter';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type {
  AudioFilterState,
  AudioSource,
  AudioType,
} from '../types';

const SENTINEL_ALL = '__all__';

interface FilterOption<V extends string | number> {
  value: V;
  label: string;
}

interface FilterSelectProps<V extends string | number> {
  value: V | null;
  placeholder: string;
  options: FilterOption<V>[];
  onChange: (next: V | null) => void;
  ariaLabel: string;
  triggerWidthClass?: string;
}

function FilterSelect<V extends string | number>({
  value,
  placeholder,
  options,
  onChange,
  ariaLabel,
  triggerWidthClass = 'w-40',
}: FilterSelectProps<V>) {
  const stringValue = value === null ? SENTINEL_ALL : String(value);

  const handleChange = (raw: string) => {
    if (raw === SENTINEL_ALL) {
      onChange(null);
      return;
    }
    const matched = options.find((o) => String(o.value) === raw);
    onChange(matched ? matched.value : null);
  };

  return (
    <Select value={stringValue} onValueChange={handleChange}>
      <SelectTrigger className={triggerWidthClass} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SENTINEL_ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface AudioLibraryToolbarProps {
  filters: AudioFilterState;
  count: number;
  availableTags: string[];
  /** [lo, hi] from items dataset; if [0,0], duration filter is disabled. */
  durationBounds: [number, number];
  searchPlaceholder: string;
  searchAriaLabel: string;
  countLabelSingular: string;
  countLabelPlural: string;
  durationStepMs?: number;
  onChange: (next: AudioFilterState) => void;
}

export function AudioLibraryToolbar({
  filters,
  count,
  availableTags,
  durationBounds,
  searchPlaceholder,
  searchAriaLabel,
  countLabelSingular,
  countLabelPlural,
  durationStepMs,
  onChange,
}: AudioLibraryToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 200);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (filters.search !== searchInput && filters.search === '') {
      setSearchInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const update = (patch: Partial<AudioFilterState>) =>
    onChange({ ...filters, ...patch });

  const sourceOptions: FilterOption<AudioSource>[] = [
    { value: 0, label: 'Uploaded' },
    { value: 1, label: 'Generated' },
  ];

  const typeOptions: FilterOption<AudioType>[] = [
    { value: 'loop', label: 'Loop' },
    { value: 'one_shot', label: 'One-shot' },
  ];

  const handleTagsChange = (tags: string[]) => update({ tags });

  const handleDurationChange = (range: [number, number]) => {
    const [lo, hi] = range;
    const atBounds = lo === durationBounds[0] && hi === durationBounds[1];
    update({ durationRange: atBounds ? null : range });
  };

  const durationValue: [number, number] = filters.durationRange ?? durationBounds;

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 px-6">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          className="pl-10"
        />
      </div>

      <FilterSelect
        value={filters.source}
        placeholder="All sources"
        options={sourceOptions}
        onChange={(v) => update({ source: v })}
        ariaLabel="Filter by source"
      />
      <FilterSelect
        value={filters.type}
        placeholder="All types"
        options={typeOptions}
        onChange={(v) => update({ type: v })}
        ariaLabel="Filter by type"
      />
      <TagsFilter
        availableTags={availableTags}
        selectedTags={filters.tags}
        onChange={handleTagsChange}
      />
      <DurationFilter
        bounds={durationBounds}
        value={durationValue}
        onChange={handleDurationChange}
        stepMs={durationStepMs}
      />

      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {count} {count === 1 ? countLabelSingular : countLabelPlural}
      </span>
    </div>
  );
}
