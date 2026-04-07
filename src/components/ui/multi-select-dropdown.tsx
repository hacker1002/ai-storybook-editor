// multi-select-dropdown.tsx - Multi-select dropdown with tag display and checkbox list.
// Lists all options without search. Used for theme/genre selection in config panels.
// Supports optional is_primary: ★ badge, primary-first sort, click tag to set primary.

import * as React from 'react';
import { ChevronDown, X, Check, Star } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('UI', 'MultiSelectDropdown');

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Value of the item currently marked as primary */
  primaryValue?: string;
  /** Called when user clicks a non-primary tag body to set it as primary */
  onPrimaryChange?: (value: string) => void;
}

export function MultiSelectDropdown({
  options,
  selectedValues,
  onChange,
  placeholder = 'Select...',
  className,
  disabled = false,
  primaryValue,
  onPrimaryChange,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const selectedLabels = React.useMemo(() => {
    const mapped = selectedValues
      .map((v) => options.find((o) => o.value === v))
      .filter(Boolean) as MultiSelectOption[];

    // Primary item always first
    if (primaryValue) {
      const primaryIdx = mapped.findIndex((i) => i.value === primaryValue);
      if (primaryIdx > 0) {
        const [primary] = mapped.splice(primaryIdx, 1);
        mapped.unshift(primary);
      }
    }
    return mapped;
  }, [options, selectedValues, primaryValue]);

  const handleToggle = React.useCallback(
    (value: string) => {
      const isSelected = selectedValues.includes(value);
      const next = isSelected
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      log.info('handleToggle', 'selection changed', { value, selected: !isSelected, total: next.length });
      onChange(next);
    },
    [selectedValues, onChange]
  );

  const handleRemoveTag = React.useCallback(
    (e: React.MouseEvent, value: string) => {
      e.stopPropagation();
      const next = selectedValues.filter((v) => v !== value);
      log.info('handleRemoveTag', 'tag removed', { value, remaining: next.length });
      onChange(next);
    },
    [selectedValues, onChange]
  );

  const handleTagClick = React.useCallback(
    (e: React.MouseEvent, value: string) => {
      // Only fire for non-primary items when onPrimaryChange is wired
      if (!onPrimaryChange || value === primaryValue) return;
      e.stopPropagation();
      log.info('handleTagClick', 'set primary', { value });
      onPrimaryChange(value);
    },
    [onPrimaryChange, primaryValue]
  );

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full min-h-9 h-auto justify-between items-start flex-wrap gap-1 py-1.5 px-3',
            className
          )}
        >
          <span className="flex flex-wrap gap-1 flex-1">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((item) => {
                const isPrimary = item.value === primaryValue;
                return (
                  <span
                    key={item.value}
                    onClick={(e) => handleTagClick(e, item.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                      isPrimary
                        ? 'bg-primary/15 font-semibold cursor-default'
                        : 'bg-accent font-medium cursor-pointer hover:bg-accent/80'
                    )}
                  >
                    {isPrimary && <Star className="h-3 w-3 fill-current text-primary" />}
                    {item.label}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveTag(e, item.value)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${item.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })
            ) : (
              <span className="text-sm font-normal text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'ml-1 mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <div className="max-h-[220px] overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No options</p>
          ) : (
            options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              const isPrimary = option.value === primaryValue;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleToggle(option.value)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                    'hover:bg-accent',
                    isSelected && 'font-medium'
                  )}
                >
                  <span className="flex items-center gap-1">
                    {isPrimary && <Star className="h-3 w-3 fill-current text-primary shrink-0" />}
                    {option.label}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
