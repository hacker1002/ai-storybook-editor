// humans-toolbar.tsx — Search input + count label. Debounce 200ms.

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SEARCH_DEBOUNCE_MS } from '@/features/humans/constants';
import type { HumansFilterState } from '@/types/human';

interface HumansToolbarProps {
  filters: HumansFilterState;
  onChange: (next: HumansFilterState) => void;
}

export function HumansToolbar({ filters, onChange }: HumansToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounced = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (debounced !== filters.search) {
      onChange({ ...filters, search: debounced });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    if (filters.search !== searchInput) setSearchInput(filters.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  return (
    <div className="flex h-16 items-center border-b border-border px-6">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search humans..."
          aria-label="Search humans"
          className="pl-9"
        />
      </div>
    </div>
  );
}
