import type { ComponentType, ReactNode } from 'react';
import { Copy, Download, Shuffle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'VoicesHeader');

interface DisabledActionProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  variant: 'ghost' | 'default';
  tooltip: string;
}

function DisabledAction({ icon: Icon, label, variant, tooltip }: DisabledActionProps): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button disabled variant={variant} className="gap-2">
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface VoicesHeaderProps {
  onPromptClick: () => void;
}

export function VoicesHeader({ onPromptClick }: VoicesHeaderProps) {
  const handlePromptClick = () => {
    log.info('onPromptClick', 'open prompt modal');
    onPromptClick();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <header className="flex items-center justify-between py-4 px-6">
        <h1 id="voices-heading" className="text-2xl font-semibold">
          Voices
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" className="gap-2" onClick={handlePromptClick}>
            <Sparkles className="h-4 w-4" />
            Prompt
          </Button>
          <DisabledAction icon={Copy} label="Clone" variant="ghost" tooltip="Coming soon" />
          <DisabledAction icon={Shuffle} label="Remix" variant="ghost" tooltip="Coming soon" />
          <DisabledAction icon={Download} label="Import" variant="default" tooltip="Coming soon" />
        </div>
      </header>
    </TooltipProvider>
  );
}
