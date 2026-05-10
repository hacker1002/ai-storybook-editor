// object-dropdown.tsx - Grouped Radix Select for picking a subject entity (character/prop/stage)

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createLogger } from '@/utils/logger';
import type { ObjectOption } from './tag-utils';
import type { SpreadTagType } from '@/types/spread-types';

const log = createLogger('Editor', 'ObjectDropdown');

const EMPTY_PLACEHOLDER = 'No subjects yet — create characters/props/stages first';
const GROUP_LABELS: Array<{ groupLabel: ObjectOption['groupLabel']; type: SpreadTagType }> = [
  { groupLabel: 'Characters', type: 'character' },
  { groupLabel: 'Props', type: 'prop' },
  { groupLabel: 'Stages', type: 'stage' },
];

interface ObjectDropdownProps {
  options: ObjectOption[];
  value: { type: SpreadTagType; object_key: string } | null;
  onChange: (opt: ObjectOption) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

function encodeValue(type: SpreadTagType, object_key: string): string {
  return `${type}|${object_key}`;
}

function decodeValue(encoded: string): { type: SpreadTagType; object_key: string } | null {
  const parts = encoded.split('|');
  if (parts.length !== 2) return null;
  return { type: parts[0] as SpreadTagType, object_key: parts[1] };
}

export function ObjectDropdown({
  options,
  value,
  onChange,
  disabled,
  placeholder = 'Pick subject...',
  ariaLabel = 'Subject',
}: ObjectDropdownProps) {
  if (options.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-0" aria-label={ariaLabel}>
          <span className="text-muted-foreground truncate text-xs">{EMPTY_PLACEHOLDER}</span>
        </SelectTrigger>
      </Select>
    );
  }

  const encodedValue = value ? encodeValue(value.type, value.object_key) : '';

  const isDangling =
    value !== null &&
    !options.some((o) => o.type === value.type && o.object_key === value.object_key);

  function handleValueChange(encoded: string) {
    const decoded = decodeValue(encoded);
    if (!decoded) return;
    const opt = options.find(
      (o) => o.type === decoded.type && o.object_key === decoded.object_key,
    );
    if (!opt) return;
    log.debug('handleValueChange', 'object selected', { type: opt.type, key: opt.object_key });
    onChange(opt);
  }

  return (
    <Select
      value={encodedValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 text-xs flex-1 min-w-0" aria-label={ariaLabel}>
        {isDangling ? (
          <span className="text-destructive truncate text-xs">
            ⚠ &lt;missing:{value!.object_key}&gt;
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {GROUP_LABELS.map(({ groupLabel }) => {
          const groupItems = options.filter((o) => o.groupLabel === groupLabel);
          if (groupItems.length === 0) return null;
          return (
            <SelectGroup key={groupLabel}>
              <SelectLabel className="text-xs">{groupLabel}</SelectLabel>
              {groupItems.map((o) => (
                <SelectItem
                  key={encodeValue(o.type, o.object_key)}
                  value={encodeValue(o.type, o.object_key)}
                  className="text-xs"
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
