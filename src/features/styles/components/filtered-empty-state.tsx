// filtered-empty-state.tsx — Shown when current search/filters return no styles. No CTA.

import { Palette } from 'lucide-react';

export function FilteredEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Palette className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No styles found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try adjusting your search or filters.
      </p>
    </div>
  );
}
