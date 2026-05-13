// remix-sidebar.tsx — Left column of RemixCreativeSpace: header (filter +
// create) + accordion list of remixes. State for expanded set + filter
// popover lives here; CRUD callbacks are wired by the parent.

import { useEffect, useState } from 'react';
import { Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/utils';
import { RemixAccordionItem } from './remix-accordion-item';
import { RemixFilterPopover } from './remix-filter-popover';
import { isBookRemixEmpty } from './default-config-builder';
import type { BookRemix } from '@/types/editor';
import type {
  Remix,
  RemixFilterState,
  SwapCropSheetTarget,
} from '@/types/remix';

interface Props {
  remixes: Remix[];
  activeRemixId: string | null;
  bookRemix: BookRemix | null;
  filter: RemixFilterState;
  onSelectRemix: (id: string) => void;
  onCreateRemix: () => void;
  onRenameRemix: (id: string, name: string) => void;
  onDeleteRemix: (id: string) => void;
  onApplyFilter: (next: RemixFilterState) => void;
  onOpenSwapCropSheet: (target: SwapCropSheetTarget) => void;
  onInject: (remixId: string) => void;
}

export function RemixSidebar({
  remixes,
  activeRemixId,
  bookRemix,
  filter,
  onSelectRemix,
  onCreateRemix,
  onRenameRemix,
  onDeleteRemix,
  onApplyFilter,
  onOpenSwapCropSheet,
  onInject,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(activeRemixId ? [activeRemixId] : []),
  );
  const [filterOpen, setFilterOpen] = useState(false);

  // Auto-expand whenever the active remix changes.
  useEffect(() => {
    if (!activeRemixId) return;
    setExpanded((prev) => {
      if (prev.has(activeRemixId)) return prev;
      const next = new Set(prev);
      next.add(activeRemixId);
      return next;
    });
  }, [activeRemixId]);

  const filterActive =
    filter.characterKeys.length > 0 || filter.propKeys.length > 0;
  const plusDisabled = isBookRemixEmpty(bookRemix);

  return (
    <aside className="flex h-full w-[280px] flex-col border-r bg-background">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8',
                filterActive && 'text-primary',
              )}
              aria-label="Filter remixes"
              disabled={!bookRemix}
            >
              <Filter
                className={cn('h-4 w-4', filterActive && 'fill-current')}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            {bookRemix && (
              <RemixFilterPopover
                bookRemix={bookRemix}
                value={filter}
                onChange={onApplyFilter}
              />
            )}
          </PopoverContent>
        </Popover>

        <h2 className="flex-1 text-sm font-semibold">Remixes</h2>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onCreateRemix}
                  disabled={plusDisabled}
                  aria-label="Create remix"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            {plusDisabled && (
              <TooltipContent>Configure remix availability first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex-1 overflow-y-auto">
        {remixes.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {plusDisabled
              ? 'Configure remix availability in Settings to start.'
              : filterActive
                ? 'No remixes match the current filter.'
                : 'No remixes yet. Click + to create your first one.'}
          </div>
        ) : (
          remixes.map((remix) => (
            <RemixAccordionItem
              key={remix.id}
              remix={remix}
              isActive={remix.id === activeRemixId}
              isExpanded={expanded.has(remix.id)}
              onToggle={() => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(remix.id)) next.delete(remix.id);
                  else next.add(remix.id);
                  return next;
                });
                onSelectRemix(remix.id);
              }}
              onRename={(name) => onRenameRemix(remix.id, name)}
              onDelete={() => onDeleteRemix(remix.id)}
              onOpenSwapCropSheet={onOpenSwapCropSheet}
              onInject={() => onInject(remix.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
