// remix-accordion-item.tsx — Single expandable remix entry with inline rename
// + hover-reveal pencil/trash. Delete fires a callback only; parent owns the
// confirm dialog (per memory rule: sidebars don't own destructive hotkeys).

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAudioJobBadgeState } from '@/stores/remix-store';
import { cn } from '@/utils/utils';
import { RemixInventorySection } from './remix-inventory-section';
import { InjectButton } from './inject-button';
import { AudioJobBadge } from './audio-job-badge';
import type { Remix, SwapCropSheetTarget } from '@/types/remix';

interface Props {
  remix: Remix;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onOpenSwapCropSheet: (target: SwapCropSheetTarget) => void;
  onRetryAudio: () => Promise<void>;
  onCancelAudio: (jobId: string) => Promise<void>;
  onDismissJob: (jobId: string) => void;
}

export function RemixAccordionItem({
  remix,
  isActive,
  isExpanded,
  onToggle,
  onRename,
  onDelete,
  onOpenSwapCropSheet,
  onRetryAudio,
  onCancelAudio,
  onDismissJob,
}: Props) {
  const audioJobState = useAudioJobBadgeState(remix.id);
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState(remix.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRenameValue(remix.name);
  }, [remix.name]);

  useEffect(() => {
    if (renameMode) inputRef.current?.focus();
  }, [renameMode]);

  const commit = () => {
    const next = renameValue.trim();
    if (next && next !== remix.name) onRename(next);
    setRenameMode(false);
  };

  const cancel = () => {
    setRenameValue(remix.name);
    setRenameMode(false);
  };

  return (
    <div className="border-b">
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2',
          isActive && 'bg-primary/5',
        )}
        onClick={(e) => {
          if (renameMode) return;
          if ((e.target as HTMLElement).closest('[data-action]')) return;
          onToggle();
        }}
        role="button"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}

        {renameMode ? (
          <Input
            ref={inputRef}
            data-action
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-7 flex-1"
          />
        ) : (
          <span className="flex-1 truncate text-sm font-medium">
            {remix.name}
          </span>
        )}

        <Button
          data-action
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setRenameMode(true);
          }}
          aria-label={`Rename ${remix.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          data-action
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${remix.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isExpanded && (
        <div className="space-y-3 px-3 pb-3">
          <RemixInventorySection
            characters={remix.characters}
            props={remix.props}
            mixes={remix.mixes}
            onOpenSwapCropSheet={(t) =>
              onOpenSwapCropSheet({ ...t, remixId: remix.id })
            }
          />
          <AudioJobBadge
            state={audioJobState}
            remixName={remix.name}
            onRetry={onRetryAudio}
            onCancel={onCancelAudio}
            onDismiss={onDismissJob}
          />
          <InjectButton />
        </div>
      )}
    </div>
  );
}
