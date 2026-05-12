// filtered-empty-state.tsx — Shown when current filters return no humans.

import { User } from 'lucide-react';

export function FilteredEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <User className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No humans found</p>
      <p className="mt-1 text-sm text-muted-foreground">Try a different search.</p>
    </div>
  );
}
