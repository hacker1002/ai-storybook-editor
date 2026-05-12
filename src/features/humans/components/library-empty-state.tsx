// library-empty-state.tsx — Shown when humans library is fully empty.

import { User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LibraryEmptyStateProps {
  onOpenCreate?: () => void;
}

export function LibraryEmptyState({ onOpenCreate }: LibraryEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <User className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No humans yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a human to start collecting visual and voice profiles.
      </p>
      {onOpenCreate ? (
        <Button variant="default" className="mt-6 gap-2" onClick={onOpenCreate}>
          <Plus className="h-4 w-4" />
          New Human
        </Button>
      ) : null}
    </div>
  );
}
