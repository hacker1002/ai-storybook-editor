// character-remix-row.tsx — toggle + name + 5 per-trait checkboxes.
// Trait checkboxes stay mounted (no CLS); disabled + greyed when the character
// toggle is off. Rendered in canonical TRAIT_TYPES order (display-only; the
// underlying traits[] is keyed by `type`).

import { Switch } from '@/components/ui/switch';
import { TRAIT_TYPES, TRAIT_LABELS } from '@/constants/trait-constants';
import type { RemixTraitEntry } from '@/types/editor';
import type { TraitType } from '@/types/human';
import { cn } from '@/utils/utils';

interface CharacterRemixRowProps {
  name: string;
  checked: boolean;
  traits: RemixTraitEntry[]; // 5 normalized entries
  onToggle: (next: boolean) => void;
  onTraitToggle: (type: TraitType, next: boolean) => void;
}

export function CharacterRemixRow({
  name,
  checked,
  traits,
  onToggle,
  onTraitToggle,
}: CharacterRemixRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle remix for ${name}`} />
      <span className="w-[360px] shrink-0 truncate text-sm">{name}</span>
      <div className={cn('ml-4 flex flex-1 flex-wrap items-center gap-x-4 gap-y-1', !checked && 'opacity-50')}>
        {TRAIT_TYPES.map((type) => {
          const traitChecked = traits.find((t) => t.type === type)?.is_enabled ?? true;
          return (
            <label
              key={type}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                checked ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={traitChecked}
                disabled={!checked}
                onChange={(e) => onTraitToggle(type, e.target.checked)}
                aria-label={`${TRAIT_LABELS[type]} trait for ${name}`}
              />
              {TRAIT_LABELS[type]}
            </label>
          );
        })}
      </div>
    </div>
  );
}
