// add-branch-card.tsx - Placeholder card to add a new branch option

import { Plus } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';

const log = createLogger('Editor', 'AddBranchCard');

interface AddBranchCardProps {
  onClick: () => void;
}

export function AddBranchCard({ onClick }: AddBranchCardProps) {
  log.debug('render', 'rendering add branch card');

  return (
    <button
      type="button"
      onClick={() => {
        log.info('onClick', 'add branch clicked');
        onClick();
      }}
      className={cn(
        'flex min-h-[280px] w-[220px] shrink-0 flex-col items-center justify-center gap-2',
        'rounded-lg border-2 border-dashed border-border',
        'text-muted-foreground transition-colors',
        'hover:bg-muted/30 hover:text-foreground',
      )}
    >
      <Plus className="h-6 w-6" />
      <span className="text-sm">Thêm lựa chọn</span>
    </button>
  );
}
