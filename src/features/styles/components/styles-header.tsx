// styles-header.tsx — Title + primary CTA for the /styles page. Stateless, emits callback only.

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Styles', 'StylesHeader');

interface StylesHeaderProps {
  onOpenNew: () => void;
  // onOpenImport?: () => void;  // DEFERRED — add when Import flow ships.
}

export function StylesHeader({ onOpenNew }: StylesHeaderProps) {
  const handleOpenNew = () => {
    log.info('onOpenNew', 'open new style modal');
    onOpenNew();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h1 id="styles-heading" className="text-lg font-semibold">
        Styles
      </h1>
      <Button variant="default" className="gap-2" onClick={handleOpenNew}>
        <Plus className="h-4 w-4" />
        New Style
      </Button>
    </header>
  );
}
