// books-toolbar.tsx — Search + step single-select filter + count for /books.
// Controlled: parent owns `filters`; toolbar holds only the local search-input
// (debounced 200ms before emitting). Step value stays number (1|2|3) to match
// book.step SMALLINT — Radix Select works on strings, so encode/decode at the
// boundary only.

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
  SEARCH_DEBOUNCE_MS,
  STEP_OPTIONS,
} from '@/features/books/constants';
import type { BooksFilterState, StepFilter } from '@/features/books/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'BooksToolbar');

interface BooksToolbarProps {
  filters: BooksFilterState;
  count: number;
  onChange: (next: BooksFilterState) => void;
}

/** Encode a StepFilter ('all' | 1 | 2 | 3) for the Radix Select string value. */
function encodeStep(step: StepFilter): string {
  return String(step);
}

/** Decode the Radix Select string back into a StepFilter (number for 1|2|3). */
function decodeStep(raw: string): StepFilter {
  if (raw === '1' || raw === '2' || raw === '3') {
    return Number(raw) as StepFilter;
  }
  return 'all';
}

function labelFor(step: StepFilter): string {
  const opt = STEP_OPTIONS.find((o) => o.value === step);
  return opt?.label ?? STEP_OPTIONS[0].label;
}

export function BooksToolbar({ filters, count, onChange }: BooksToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  // Emit debounced search up to the parent only when it actually changed.
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

  const handleStepChange = (raw: string) => {
    const next = decodeStep(raw);
    log.debug('step', 'filter change', { step: next });
    onChange({ ...filters, step: next });
  };

  return (
    <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-6 py-3">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search books..."
          aria-label="Search books"
          className="pl-10"
        />
      </div>

      <Select value={encodeStep(filters.step)} onValueChange={handleStepChange}>
        <SelectTrigger className="w-44" aria-label="Filter by step">
          <SelectValue placeholder={STEP_OPTIONS[0].label}>
            {labelFor(filters.step)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STEP_OPTIONS.map((opt) => (
            <SelectItem key={String(opt.value)} value={encodeStep(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {count} {count === 1 ? 'book' : 'books'}
      </span>
    </div>
  );
}
