// not-found-view.tsx — Shown when human :id is invalid or deleted.

import { ChevronLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotFoundViewProps {
  resource: 'human';
  onBack: () => void;
}

export function NotFoundView({ resource, onBack }: NotFoundViewProps) {
  const label = resource === 'human' ? 'Human not found' : 'Resource not found';
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <User className="h-14 w-14 text-muted-foreground" aria-hidden="true" />
      <p className="mt-4 text-lg font-medium">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been deleted or never existed.
      </p>
      <Button variant="ghost" className="mt-6 gap-2" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
    </div>
  );
}
