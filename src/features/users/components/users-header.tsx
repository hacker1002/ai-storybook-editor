// users-header.tsx — Page header: "Users" title + primary "New User" CTA.

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'UsersHeader');

interface UsersHeaderProps {
  onOpenCreate: () => void;
}

export function UsersHeader({ onOpenCreate }: UsersHeaderProps) {
  const handleClick = () => {
    log.info('onOpenCreate', 'clicked');
    onOpenCreate();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h1 id="users-heading" className="text-2xl font-semibold">
        Users
      </h1>
      <Button variant="default" className="gap-2" onClick={handleClick} aria-label="Create new user">
        <Plus className="h-4 w-4" />
        New User
      </Button>
    </header>
  );
}
