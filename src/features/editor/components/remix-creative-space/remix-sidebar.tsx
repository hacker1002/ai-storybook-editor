// remix-sidebar.tsx — Left column of RemixCreativeSpace: header (filter +
// create) + accordion list of remixes. State for expanded set + filter
// popover lives here; CRUD callbacks are wired by the parent.

import { useEffect, useState } from 'react';
import { Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { createLogger } from '@/utils/logger';
import { RemixAccordionItem } from './remix-accordion-item';
import { RemixFilterPopover } from './remix-filter-popover';
import { isBookRemixEmpty } from './default-config-builder';
import type { BookRemix } from '@/types/editor';
import type {
  EnqueueRemixJobOutcome,
  Remix,
  RemixFilterState,
  SwapCropSheetTarget,
} from '@/types/remix';

const log = createLogger('Editor', 'RemixSidebar');

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
  onRetryAudio: (remixId: string) => Promise<EnqueueRemixJobOutcome>;
  onCancelAudio: (remixId: string, jobId: string) => Promise<void>;
  onDismissJob: (jobId: string) => void;
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
  onRetryAudio,
  onCancelAudio,
  onDismissJob,
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
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
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
              onRetryAudio={async () => {
                try {
                  const outcome = await onRetryAudio(remix.id);
                  log.info('onRetryAudio', 'outcome', {
                    remixId: remix.id,
                    kind: outcome.kind,
                  });
                  switch (outcome.kind) {
                    case 'enqueued':
                      toast.info('Audio retry started');
                      break;
                    case 'deduped':
                      toast.info('Audio job already running');
                      break;
                    case 'skipped':
                      toast.info('Audio already in sync');
                      break;
                  }
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  log.error('onRetryAudio', 'failed', {
                    remixId: remix.id,
                    error: message,
                  });
                  toast.error(`Audio retry failed: ${message}`);
                }
              }}
              onCancelAudio={async (jobId) => {
                try {
                  await onCancelAudio(remix.id, jobId);
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  log.error('onCancelAudio', 'failed', {
                    remixId: remix.id,
                    jobId,
                    error: message,
                  });
                  toast.error(`Cancel failed: ${message}`);
                }
              }}
              onDismissJob={onDismissJob}
            />
          ))
        )}
      </div>
    </aside>
  );
}
