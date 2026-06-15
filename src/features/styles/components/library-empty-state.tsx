// library-empty-state.tsx — Shown when the art-style library (DB) is fully empty. Has a CTA.

import { Palette, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LibraryEmptyStateProps {
  onOpenNew?: () => void;
}

export function LibraryEmptyState({ onOpenNew }: LibraryEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16"
    >
      <Palette className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No styles yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create an art style — add reference images and a description.
      </p>
      {onOpenNew ? (
        <Button variant="default" className="mt-6 gap-2" onClick={onOpenNew}>
          <Plus className="h-4 w-4" />
          New Style
        </Button>
      ) : null}
    </div>
  );
}
