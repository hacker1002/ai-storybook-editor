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
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  GENDER_LABEL,
  TYPE_LABEL,
  getLanguageName,
  titleCase,
} from '@/features/voices/utils/voice-labels';
import type {
  VoiceGender,
  VoiceType,
  VoicesFilterState,
} from '@/types/voice';

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

interface VoicesToolbarProps {
  filters: VoicesFilterState;
  count: number;
  availableLanguages: string[];
  availableTags: string[];
  onChange: (next: VoicesFilterState) => void;
}

export function VoicesToolbar({
  filters,
  count,
  availableLanguages,
  availableTags,
  onChange,
}: VoicesToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 200);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep local input in sync if filters reset externally.
  useEffect(() => {
    if (filters.search !== searchInput && filters.search === '') {
      setSearchInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const update = (patch: Partial<VoicesFilterState>) =>
    onChange({ ...filters, ...patch });

  const typeOptions: FilterOption<VoiceType>[] = [
    { value: 0, label: TYPE_LABEL[0] },
    { value: 1, label: TYPE_LABEL[1] },
    { value: 2, label: TYPE_LABEL[2] },
    { value: 3, label: TYPE_LABEL[3] },
  ];

  const genderOptions: FilterOption<VoiceGender>[] = [
    { value: 0, label: GENDER_LABEL[0] },
    { value: 1, label: GENDER_LABEL[1] },
  ];

  const languageOptions: FilterOption<string>[] = availableLanguages.map((c) => ({
    value: c,
    label: getLanguageName(c),
  }));

  const tagOptions: FilterOption<string>[] = availableTags.map((t) => ({
    value: t,
    label: titleCase(t),
  }));

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 px-6">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search voices..."
          aria-label="Search voices"
          className="pl-10"
        />
      </div>

      <FilterSelect
        value={filters.type}
        placeholder="All Types"
        options={typeOptions}
        onChange={(v) => update({ type: v })}
        ariaLabel="Filter by type"
      />
      <FilterSelect
        value={filters.gender}
        placeholder="All Genders"
        options={genderOptions}
        onChange={(v) => update({ gender: v })}
        ariaLabel="Filter by gender"
      />
      <FilterSelect
        value={filters.language}
        placeholder="All Languages"
        options={languageOptions}
        onChange={(v) => update({ language: v })}
        ariaLabel="Filter by language"
      />
      <FilterSelect
        value={filters.tag}
        placeholder="All Tags"
        options={tagOptions}
        onChange={(v) => update({ tag: v })}
        ariaLabel="Filter by tag"
      />

      <span
        className="ml-auto text-sm text-muted-foreground"
        aria-live="polite"
      >
        {count} {count === 1 ? 'voice' : 'voices'}
      </span>
    </div>
  );
}
