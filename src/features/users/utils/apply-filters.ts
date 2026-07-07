// apply-filters.ts — Client-side filtering for the Users list (small list, no
// server-side paging in MVP). Filters on search (name + email, case-insensitive),
// role, and DERIVED displayStatus.

import type { SystemUser, UsersFilterState } from '@/features/users/types';

export function applyFilters(users: SystemUser[], f: UsersFilterState): SystemUser[] {
  const needle = f.search.trim().toLowerCase();
  const hasSearch = needle.length > 0;

  return users.filter((u) => {
    if (f.role !== 'all' && u.role !== f.role) return false;
    if (f.status !== 'all' && u.displayStatus !== f.status) return false; // ⚡ derived
    if (hasSearch) {
      const hay = `${u.name ?? ''} ${u.email}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
