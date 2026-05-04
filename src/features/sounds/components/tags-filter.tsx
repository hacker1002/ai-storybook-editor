import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'TagsFilter');

interface TagsFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onChange: (next: string[]) => void;
}

export function TagsFilter({
  availableTags,
  selectedTags,
  onChange,
}: TagsFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    log.debug('toggle', 'tag toggled', { tag, count: next.length });
    onChange(next);
  };

  const triggerLabel =
    selectedTags.length > 0 ? `Tags · ${selectedTags.length}` : 'Tags';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2" aria-label="Filter by tag">
          {triggerLabel}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          Filter by tag
        </h4>
        {availableTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags available</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => toggle(tag)}
                  className={cn(
                    'text-xs rounded px-2 py-0.5 transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
