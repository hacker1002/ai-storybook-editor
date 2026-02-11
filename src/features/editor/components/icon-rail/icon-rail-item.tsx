import * as Icons from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { IconRailItemConfig } from '@/types/editor';
import { cn } from '@/lib/utils';

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
    console.warn(`Icon "${item.icon}" not found in lucide-react`);
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-current={isActive ? 'page' : undefined}
          aria-label={item.label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <IconComponent className="h-5 w-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{item.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
