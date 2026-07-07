// users-toolbar.tsx — Search (debounced) + Role filter + Status filter (4 opts)
// + result count. Controlled by the page (filter state lives there).

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
  ROLE_FILTER_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  STATUS_FILTER_OPTIONS,
} from '@/features/users/constants';
import type {
  DisplayStatus,
  SystemRole,
  UsersFilterState,
} from '@/features/users/types';

interface UsersToolbarProps {
  filters: UsersFilterState;
  count: number; // number of users AFTER filtering → "N users"
  onChange: (next: UsersFilterState) => void;
}

export function UsersToolbar({ filters, count, onChange }: UsersToolbarProps) {
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
    <div className="flex h-16 items-center gap-4 border-b border-border px-6">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search users..."
          aria-label="Search users"
          className="pl-9"
        />
      </div>

      <label className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Role
        </span>
        <Select
          value={filters.role}
          onValueChange={(v) => onChange({ ...filters, role: v as SystemRole | 'all' })}
        >
          <SelectTrigger className="w-[130px]" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v as DisplayStatus | 'all' })}
        >
          <SelectTrigger className="w-[140px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <span className="shrink-0 text-sm text-muted-foreground">
        {count === 1 ? '1 user' : `${count} users`}
      </span>
    </div>
  );
}
