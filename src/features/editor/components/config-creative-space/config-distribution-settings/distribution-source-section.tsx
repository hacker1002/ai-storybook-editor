// distribution-source-section.tsx — Accordion for one source (ORIGINAL or a
// remix). Collapsible header + body of ChannelExportGroups. Body lazy-mounts
// (Collapsible) when expanded. Design §3.1.

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export interface DistributionSourceSectionProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function DistributionSourceSection({
  label,
  expanded,
  onToggle,
  children,
}: DistributionSourceSectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center justify-between border-b py-2 text-left text-sm font-semibold hover:text-foreground">
        <span className="uppercase tracking-wide">{label}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
