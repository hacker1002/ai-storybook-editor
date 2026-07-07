import * as Icons from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { IconRailItemConfig } from '@/types/editor';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'IconRailItem');

interface IconRailItemProps {
  item: IconRailItemConfig;
  isActive: boolean;
  onClick: () => void;
}

export function IconRailItem({ item, isActive, onClick }: IconRailItemProps) {
  const IconComponent = Icons[item.icon as keyof typeof Icons] as React.ComponentType<{
    className?: string;
  }>;

  if (!IconComponent) {
    log.warn('render', 'icon not found in lucide-react', { icon: item.icon });
    return null;
  }

  // Collaboration-mode gating: a disabled item (viewer = non-owner, resource/utility
  // not granted) renders greyed + a reason tooltip and swallows its click. We use
  // `aria-disabled` (NOT the native `disabled` prop) so the tooltip still fires on
  // hover — a truly disabled button receives no pointer events. UX-only gate.
  const disabled = item.isDisabled === true;

  const handleClick = () => {
    if (disabled) {
      log.debug('handleClick', 'disabled item click ignored (no-op)', { id: item.id });
      return;
    }
    onClick();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          aria-current={isActive ? 'page' : undefined}
          aria-disabled={disabled ? true : undefined}
          aria-label={item.label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            disabled
              ? 'text-muted-foreground opacity-40 cursor-not-allowed'
              : isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <IconComponent className="h-5 w-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{disabled ? 'Not shared with you' : item.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
