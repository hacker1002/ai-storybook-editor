// styles-toolbar.tsx — Search + filter controls for the /styles page. Controlled: parent owns
// `filters`; toolbar only holds local search-input + popover-open state. References = single
// Select; Tags = multi-select chip popover (OR semantics) that stays open while toggling.

import { useEffect, useState } from 'react';
import { ChevronDown, Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SEARCH_DEBOUNCE_MS } from '@/features/styles/constants/constants';
import type { ReferencesFilter, StylesFilterState } from '@/types/art-style';
import { createLogger } from '@/utils/logger';

const log = createLogger('Styles', 'StylesToolbar');

const REF_LABEL: Record<ReferencesFilter, string> = {
  all: 'All references',
  with: 'With references',
  none: 'No references',
};

const REF_OPTIONS: ReferencesFilter[] = ['all', 'with', 'none'];

interface StylesToolbarProps {
  filters: StylesFilterState;
  count: number;
  availableTags: string[];
  onChange: (next: StylesFilterState) => void;
}

export function StylesToolbar({
  filters,
  count,
  availableTags,
  onChange,
}: StylesToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      log.debug('search', 'debounced search change', { len: debouncedSearch.length });
      onChange({ ...filters, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep local input in sync if filters reset externally (e.g. clear-all).
  useEffect(() => {
    if (filters.search !== searchInput && filters.search === '') {
      setSearchInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const update = (patch: Partial<StylesFilterState>) =>
    onChange({ ...filters, ...patch });

  const handleReferencesChange = (raw: string) => {
    const next = REF_OPTIONS.includes(raw as ReferencesFilter)
      ? (raw as ReferencesFilter)
      : 'all';
    log.debug('references', 'filter change', { references: next });
    update({ references: next });
  };

  const toggleTag = (tag: string) => {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    log.debug('tags', 'toggle tag', { selectedCount: next.length });
    update({ tags: next });
  };

  const clearTags = () => {
    log.debug('tags', 'clear tags');
    update({ tags: [] });
  };

  const selectedTagCount = filters.tags.length;

  return (
    <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-6 py-3">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search styles..."
          aria-label="Search styles"
          className="pl-10"
        />
      </div>

      <Select value={filters.references} onValueChange={handleReferencesChange}>
        <SelectTrigger className="w-44" aria-label="Filter by references">
          <SelectValue placeholder={REF_LABEL.all}>
            {REF_LABEL[filters.references]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {REF_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {REF_LABEL[opt]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2" aria-label="Filter by tags">
            <Filter className="h-4 w-4" />
            Tags
            {selectedTagCount > 0 ? (
              <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                {selectedTagCount}
              </span>
            ) : null}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              FILTER BY TAG
            </span>
            {selectedTagCount > 0 ? (
              <button
                type="button"
                onClick={clearTags}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>

          {availableTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const selected = filters.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleTag(tag)}
                    className={
                      selected
                        ? 'rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground'
                        : 'rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent'
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {count} {count === 1 ? 'style' : 'styles'}
      </span>
    </div>
  );
}
