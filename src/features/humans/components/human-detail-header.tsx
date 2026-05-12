// human-detail-header.tsx — Back + title + destructive delete in detail page header.

import { ChevronLeft, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentLocale } from '@/hooks/use-current-locale';
import { resolveDisplayName } from '@/features/humans/utils/display-name-helpers';
import type { Human } from '@/types/human';

interface HumanDetailHeaderProps {
  human: Human;
  onBack: () => void;
  onDelete: () => void;
}

export function HumanDetailHeader({ human, onBack, onDelete }: HumanDetailHeaderProps) {
  const locale = useCurrentLocale();
  const displayName = resolveDisplayName(human, locale);

  return (
    <header className="flex items-center justify-between gap-3 py-4 px-6 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Humans
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1
          id="human-detail-heading"
          className="text-lg font-semibold truncate"
        >
          {displayName || 'Untitled'}
        </h1>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
        aria-label={`Delete ${displayName}`}
      >
        <Trash className="h-4 w-4" />
        Delete
      </Button>
    </header>
  );
}
