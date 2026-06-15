// art-style-select.tsx — Combobox-style art-style picker built on the existing
// Popover primitive (no `cmdk`/`Command` dependency — per plan decision). Each
// option renders a thumbnail preview + name; a "(None)" row clears the value
// when `clearable`. Used by NewBookModal where Art Style is OPTIONAL.
//
// a11y: trigger is role=combobox/aria-expanded; the listbox is role=listbox and
// each row role=option/aria-selected; Esc closes (Popover default + search key
// handler); thumbnails carry alt={name}.

import * as React from 'react';
import { ChevronsUpDown, Search, Palette, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { ArtStyleOption } from '@/features/books/types';

const log = createLogger('Books', 'ArtStyleSelect');

interface ArtStyleSelectProps {
  value: string | null;
  options: ArtStyleOption[];
  onChange: (id: string | null) => void;
  clearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** Small square thumbnail with a Palette-icon fallback when no preview URL. */
function Thumb({
  url,
  name,
  className,
  iconClassName = 'h-4 w-4',
}: {
  url?: string;
  name: string;
  className?: string;
  iconClassName?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn('rounded object-cover bg-muted', className)}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('flex items-center justify-center rounded bg-muted text-muted-foreground', className)}
    >
      <Palette className={iconClassName} />
    </span>
  );
}

export function ArtStyleSelect({
  value,
  options,
  onChange,
  clearable = false,
  disabled = false,
  placeholder = 'Search art style...',
}: ArtStyleSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const selected = React.useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.name.toLowerCase().includes(term));
  }, [options, searchTerm]);

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (next) setSearchTerm('');
    setOpen(next);
  }, []);

  const handleSelect = React.useCallback(
    (id: string | null) => {
      log.info('handleSelect', 'art style picked', { id });
      onChange(id);
      setOpen(false);
    },
    [onChange],
  );

  const handleClearTrigger = React.useCallback(
    (e: React.MouseEvent) => {
      // Clear from the trigger without opening the popover.
      e.stopPropagation();
      log.debug('handleClearTrigger', 'cleared from trigger');
      onChange(null);
    },
    [onChange],
  );

  const handleSearchKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Thumb url={selected.thumbnailUrl} name={selected.name} className="h-6 w-6" />
              <span className="truncate text-sm">{selected.name}</span>
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">{placeholder}</span>
          )}
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear art style"
                onClick={handleClearTrigger}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[--radix-popover-trigger-width] p-0"
      >
        {/* Search */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Options */}
        <div role="listbox" className="max-h-[400px] overflow-y-auto py-1">
          {clearable && (
            <div
              role="option"
              aria-selected={value === null}
              onClick={() => handleSelect(null)}
              className={cn(
                'flex cursor-pointer items-center rounded-sm px-3 py-2.5 text-sm text-muted-foreground',
                'hover:bg-accent',
                value === null && 'font-medium',
              )}
            >
              (None)
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {options.length === 0 ? 'No art styles yet' : 'No results found'}
            </p>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.id === value;
              return (
                <div
                  key={opt.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm',
                    'hover:bg-accent',
                    isSelected && 'bg-accent/60 font-medium',
                  )}
                >
                  <Thumb
                    url={opt.thumbnailUrl}
                    name={opt.name}
                    className="h-16 w-16 shrink-0"
                    iconClassName="h-7 w-7"
                  />
                  <span className="truncate">{opt.name}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
