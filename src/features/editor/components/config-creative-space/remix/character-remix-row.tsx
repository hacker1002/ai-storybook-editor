// character-remix-row.tsx — toggle + name + type dropdown.
// Dropdown stays mounted; opacity + disabled when toggle is off (no CLS).

import { Switch } from '@/components/ui/switch';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { CHARACTER_TYPE_OPTIONS } from '@/constants/config-constants';
import type { CharacterRemixType } from '@/types/editor';
import { cn } from '@/utils/utils';

interface CharacterRemixRowProps {
  name: string;
  checked: boolean;
  type: CharacterRemixType;
  onToggle: (next: boolean) => void;
  onTypeChange: (next: CharacterRemixType) => void;
}

const DROPDOWN_OPTIONS = CHARACTER_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

function isCharacterRemixType(value: string): value is CharacterRemixType {
  return CHARACTER_TYPE_OPTIONS.some((o) => o.value === value);
}

export function CharacterRemixRow({
  name,
  checked,
  type,
  onToggle,
  onTypeChange,
}: CharacterRemixRowProps) {
  const handleTypeChange = (value: string) => {
    if (!isCharacterRemixType(value)) return;
    if (!checked) return;
    onTypeChange(value);
  };

  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle remix for ${name}`} />
      <span className="flex-1 truncate text-sm">{name}</span>
      <SearchableDropdown
        options={DROPDOWN_OPTIONS}
        value={type}
        onChange={handleTypeChange}
        disabled={!checked}
        className={cn('w-[180px]', !checked && 'opacity-50')}
      />
    </div>
  );
}
