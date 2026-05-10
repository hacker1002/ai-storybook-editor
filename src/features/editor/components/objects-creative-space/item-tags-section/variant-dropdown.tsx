// variant-dropdown.tsx - Radix Select for picking a variant of a selected subject entity

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createLogger } from '@/utils/logger';
import type { VariantOption } from './tag-utils';

const log = createLogger('Editor', 'VariantDropdown');

interface VariantDropdownProps {
  variants: VariantOption[];
  value: string | undefined;
  taken: Set<string>;
  onChange: (variantKey: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

function sortVariants(variants: VariantOption[]): VariantOption[] {
  return [...variants].sort((a, b) => {
    if (a.key === 'default') return -1;
    if (b.key === 'default') return 1;
    return a.name.localeCompare(b.name);
  });
}

export function VariantDropdown({
  variants,
  value,
  taken,
  onChange,
  disabled,
  placeholder = 'Default',
  ariaLabel = 'Variant',
}: VariantDropdownProps) {
  // Dangling object or no variants available — render disabled fallback
  if (variants.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="h-7 text-xs w-24 shrink-0" aria-label={ariaLabel}>
          {value ? (
            <span className="text-destructive truncate text-xs">
              ⚠ &lt;missing:{value}&gt;
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">{placeholder}</span>
          )}
        </SelectTrigger>
      </Select>
    );
  }

  const isDanglingVariant =
    value !== undefined && value !== '' && !variants.some((v) => v.key === value);

  const sorted = sortVariants(variants);

  function handleValueChange(key: string) {
    log.debug('handleValueChange', 'variant selected', { key });
    onChange(key);
  }

  return (
    <Select
      value={value ?? ''}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 text-xs w-24 shrink-0" aria-label={ariaLabel}>
        {isDanglingVariant ? (
          <span className="text-destructive truncate text-xs">
            ⚠ &lt;missing:{value}&gt;
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {sorted.map((v) => {
          const isTakenElsewhere = taken.has(v.key) && v.key !== value;
          return (
            <SelectItem
              key={v.key}
              value={v.key}
              disabled={isTakenElsewhere}
              className="text-xs"
            >
              {v.name}
              {isTakenElsewhere ? ' ⊘ (used)' : ''}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
