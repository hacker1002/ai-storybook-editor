// audio-asset-selector.tsx
// Popover-based picker for a single music or sound asset (soft FK by id).
// - Search by name/tags.
// - Inline preview row via reused `InlineAudioPlayer` (hideVolume) with
//   selector-level single-active state.
// - Nullable: clear button when value is set.
// - Empty state: CTA to /musics or /sounds.
// - Dangling FK: render placeholder + log.warn (no auto-null).

import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { InlineAudioPlayer } from '@/components/audio/inline-audio-player';
import { formatDuration } from '@/utils/format-duration';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Music } from '@/types/music';
import type { Sound } from '@/types/sound';

const log = createLogger('Editor', 'AudioAssetSelector');

type AudioAssetItem = Music | Sound;

export interface AudioAssetSelectorProps {
  kind: 'music' | 'sound';
  value: string | null;
  options: ReadonlyArray<AudioAssetItem>;
  placeholder: string;
  nullable?: boolean;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  className?: string;
}

function matches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export function AudioAssetSelector({
  kind,
  value,
  options,
  placeholder,
  nullable = true,
  disabled = false,
  onChange,
  className,
}: AudioAssetSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );
  const isDangling = value !== null && !selected;

  React.useEffect(() => {
    if (isDangling) {
      log.warn('dangling_value', 'asset id has no match in options', {
        kind,
        valueId: value,
      });
    }
  }, [isDangling, kind, value]);

  // Reset transient state when popover closes.
  React.useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setActiveId(null);
    }
  }, [isOpen]);

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => matches(o.name, q) || matches(o.tags, q) || matches(o.description, q),
    );
  }, [options, searchQuery]);

  const handleSelect = React.useCallback(
    (id: string) => {
      log.info('handleSelect', 'committed', { kind, id });
      onChange(id);
      setIsOpen(false);
    },
    [kind, onChange],
  );

  const handleClear = React.useCallback(() => {
    log.info('handleClear', 'cleared selection', { kind });
    onChange(null);
    setIsOpen(false);
  }, [kind, onChange]);

  const triggerLabel = isDangling
    ? `${placeholder} (missing)`
    : (selected?.name ?? placeholder);

  const emptyHref = kind === 'music' ? '/musics' : '/sounds';

  return (
    <div className={cn('w-full', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-between text-left font-normal',
              !selected && 'text-muted-foreground',
              isDangling && 'text-destructive',
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[360px] p-0"
          align="start"
        >
          <div className="border-b p-2">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${kind}...`}
              className="h-8"
            />
          </div>

          {nullable && value !== null && (
            <button
              type="button"
              onClick={handleClear}
              className="flex w-full items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
              Clear selection
            </button>
          )}

          <div className="max-h-72 overflow-y-auto">
            {options.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <p>No {kind === 'music' ? 'music' : 'sounds'} yet.</p>
                <Link
                  to={emptyHref}
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  onClick={() => setIsOpen(false)}
                >
                  Add {kind === 'music' ? 'music' : 'sounds'}
                </Link>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No matches.
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = item.id === value;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/60"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className="flex flex-col items-start gap-0.5 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {item.name}
                        {isSelected && (
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                          />
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration((item.duration ?? 0) / 1000)}
                        {item.tags ? ` · ${item.tags}` : ''}
                      </span>
                    </button>
                    <InlineAudioPlayer
                      src={item.mediaUrl}
                      hideVolume
                      isActive={activeId === item.id}
                      onPlayStart={() => setActiveId(item.id)}
                      className="border-0 px-0 py-0"
                    />
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
