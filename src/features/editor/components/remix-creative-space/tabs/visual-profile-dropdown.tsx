// visual-profile-dropdown.tsx — Visual-profile picker for the Characters tab.
//
// A purpose-built searchable popover that renders each option with a thumbnail
// preview (the profile's processed image) left of the name, in a roomier row so
// the preview is legible. Intentionally NOT folded into the shared
// `SearchableDropdown` — thumbnails are specific to visual profiles and the
// shared control feeds ~15 plain (thumbnail-less) dropdowns across the app.

import * as React from 'react';
import { ChevronDown, Search, Check, ImageOff } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VisualProfileDropdown');

export interface VisualProfileOption {
  value: string;
  label: string;
  /** Processed preview image; null when the profile has no image yet. */
  thumbnail?: string | null;
}

export interface VisualProfileDropdownProps {
  options: VisualProfileOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

export function VisualProfileDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  className,
  disabled = false,
}: VisualProfileDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  // Track URLs that failed to load so we fall back to the placeholder slot
  // instead of a broken-image glyph (signed URLs can expire, profiles can lag).
  const [brokenThumbs, setBrokenThumbs] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );

  const selectedLabel = React.useMemo(
    () => options.find((o) => o.value === value)?.label ?? null,
    [options, value]
  );

  const filteredOptions = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, searchTerm]);

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (next) setSearchTerm('');
    setOpen(next);
  }, []);

  const handleSelect = React.useCallback(
    (optionValue: string, optionLabel: string) => {
      log.info('handleSelect', 'option selected', {
        value: optionValue,
        label: optionLabel,
      });
      onChange(optionValue);
      setOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') setOpen(false);
    },
    []
  );

  const markBroken = React.useCallback((url: string) => {
    log.debug('markBroken', 'thumbnail failed to load — fallback', {});
    setBrokenThumbs((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', className)}
        >
          <span className="truncate text-sm font-normal">
            {selectedLabel ?? (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
      >
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[280px] overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results found
            </p>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = option.value === value;
              const showImage =
                Boolean(option.thumbnail) &&
                !brokenThumbs.has(option.thumbnail as string);
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value, option.label)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm',
                    'hover:bg-accent',
                    isSelected && 'font-medium'
                  )}
                >
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {showImage ? (
                      <img
                        src={option.thumbnail as string}
                        alt={option.label}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                        onError={() => markBroken(option.thumbnail as string)}
                      />
                    ) : (
                      <ImageOff
                        className="h-6 w-6 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
