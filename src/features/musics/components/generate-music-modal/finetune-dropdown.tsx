// Searchable dropdown for music finetunes. Supports a null option ("None —
// Base music model") for the default no-finetune flow. Built on top of the
// existing shadcn Popover (no new deps).

import { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { MUSIC_FINETUNES, type MusicFinetune } from '@/constants/music-finetunes';

const log = createLogger('Musics', 'FinetuneDropdown');

const NONE_OPTION: MusicFinetune = {
  slug: '__none__',
  name: 'None',
  description: 'Base music model',
};

export interface FinetuneDropdownProps {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function FinetuneDropdown({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a finetune…',
}: FinetuneDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => MUSIC_FINETUNES.find((f) => f.slug === value) ?? null,
    [value],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return MUSIC_FINETUNES;
    return MUSIC_FINETUNES.filter(
      (f) =>
        f.name.toLowerCase().includes(term) ||
        f.description.toLowerCase().includes(term),
    );
  }, [search]);

  const handleOpenChange = (next: boolean) => {
    if (next) setSearch('');
    setOpen(next);
  };

  const handleSelect = (slug: string | null, label: string) => {
    log.info('handleSelect', 'finetune selected', { slug });
    onChange(slug);
    setOpen(false);
    void label;
  };

  const triggerLabel = selected
    ? selected.name
    : value === null
      ? 'None (Base music model)'
      : placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between')}
        >
          <span className="truncate text-sm font-normal">{triggerLabel}</span>
          <ChevronDown
            className={cn(
              'ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        className={cn(
          'z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          'w-[--radix-popover-trigger-width] p-0',
        )}
      >
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Search finetunes..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search finetunes"
          />
        </div>

        <div className="max-h-[280px] overflow-y-auto py-1">
          <FinetuneItem
            option={NONE_OPTION}
            isSelected={value === null}
            onSelect={() => handleSelect(null, NONE_OPTION.name)}
            displayName="None (Base music model)"
            description="Default — no finetune"
          />
          <div className="my-1 border-t" />
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results found
            </p>
          ) : (
            filtered.map((f) => (
              <FinetuneItem
                key={f.slug}
                option={f}
                isSelected={f.slug === value}
                onSelect={() => handleSelect(f.slug, f.name)}
                displayName={f.name}
                description={f.description}
              />
            ))
          )}
        </div>
      </PopoverPrimitive.Content>
    </Popover>
  );
}

interface FinetuneItemProps {
  option: MusicFinetune;
  isSelected: boolean;
  onSelect: () => void;
  displayName: string;
  description: string;
}

function FinetuneItem({
  isSelected,
  onSelect,
  displayName,
  description,
}: FinetuneItemProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
        'hover:bg-accent',
        isSelected && 'font-medium bg-accent/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate">{displayName}</div>
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      </div>
      {isSelected ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : null}
    </div>
  );
}
