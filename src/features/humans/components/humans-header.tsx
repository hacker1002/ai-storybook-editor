// humans-header.tsx — Page header with title + New Human action.

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'HumansHeader');

interface HumansHeaderProps {
  onOpenCreate: () => void;
}

export function HumansHeader({ onOpenCreate }: HumansHeaderProps) {
  const handleClick = () => {
    log.info('onOpenCreate', 'clicked');
    onOpenCreate();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h1 id="humans-heading" className="text-2xl font-semibold">
        Humans
      </h1>
      <Button variant="default" className="gap-2" onClick={handleClick}>
        <Plus className="h-4 w-4" />
        New Human
      </Button>
    </header>
  );
}
