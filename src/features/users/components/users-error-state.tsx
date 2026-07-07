// users-error-state.tsx — Distinct load-failure state (vs the "no users yet"
// empty state) so a transient fetch error isn't mistaken for an empty system.

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UsersErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function UsersErrorState({ message, onRetry }: UsersErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Failed to load users</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
