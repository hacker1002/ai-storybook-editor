// character-swap-row.tsx — One character row in the Characters tab (config-only).
// Header: enable switch, name, Human → Visual cascade, 5 trait checkboxes.
//
// The synchronous live-swap action was removed (2026-06-08): appearance swap is
// now an async background job (api/jobs/02 sprite-swap) driven from the swap
// crop-sheet modal, NOT from this create-remix modal. This row only captures the
// per-character config (human/visual/traits) persisted into RemixConfig.
//
// Enable chain: Human → Visual → Traits. Traits render in canonical TRAIT_TYPES
// order; a book-gated-off trait is shown disabled.

import { Switch } from '@/components/ui/switch';
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from '@/components/ui/searchable-dropdown';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { TRAIT_TYPES, TRAIT_LABELS } from '@/constants/trait-constants';
import type { TraitType } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixCharacterChoice, RemixTraitChoice } from '@/types/remix';

const log = createLogger('Editor', 'CharacterSwapRow');

interface Props {
  bookChar: RemixCharacterEntry;
  entry: RemixCharacterChoice | undefined;
  humanOptions: SearchableDropdownOption[];
  visualOptions: SearchableDropdownOption[];
  /** Traits the selected visual can swap (non-empty description); null = no visual yet. */
  supportedTraits: Set<TraitType> | null;
  onUpsert: (patch: Partial<RemixCharacterChoice>) => void;
  onChangeHuman: (humanId: string) => void;
}

/** Book-level gate per trait — a trait the book disabled cannot be configured. */
function bookGateOf(bookChar: RemixCharacterEntry, type: TraitType): boolean {
  return bookChar.traits.find((t) => t.type === type)?.is_enabled ?? true;
}

export function CharacterSwapRow({
  bookChar,
  entry,
  humanOptions,
  visualOptions,
  supportedTraits,
  onUpsert,
  onChangeHuman,
}: Props) {
  const enabled = entry?.is_enabled ?? false;
  const humanId = entry?.human_id ?? null;
  const visual = entry?.visual ?? null;
  const traits = entry?.traits ?? [];

  const traitsInteractive = enabled && !!humanId && !!visual;

  // A visual profile only supports traits it has a description for. Once a visual
  // is picked, traits it doesn't support are disabled so the user can't enable them.
  const visualSupports = (type: TraitType) =>
    supportedTraits ? supportedTraits.has(type) : true;

  const toggleTrait = (type: TraitType, checked: boolean) => {
    log.debug('toggleTrait', 'change', { key: bookChar.key, type, checked });
    const next: RemixTraitChoice[] = TRAIT_TYPES.map((t) => {
      if (t === type) return { type: t, is_enabled: checked };
      return traits.find((x) => x.type === t) ?? { type: t, is_enabled: true };
    });
    onUpsert({ traits: next });
  };

  return (
    <div className={cn('rounded-md border', !enabled && 'opacity-60')}>
      <div className="flex items-center gap-2 p-3">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onUpsert({ is_enabled: v })}
          aria-label={`Toggle ${bookChar.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">
            {bookChar.name}
          </div>
          <div className="truncate text-xs leading-tight text-muted-foreground">
            @{bookChar.key}
          </div>
        </div>

        <SearchableDropdown
          options={humanOptions}
          value={humanId}
          onChange={onChangeHuman}
          placeholder="Human"
          disabled={!enabled}
          className="w-[108px] shrink-0"
        />
        <SearchableDropdown
          options={visualOptions}
          value={visual}
          onChange={(v) => onUpsert({ visual: v })}
          placeholder={humanId ? 'Visual' : 'Pick Human'}
          disabled={!enabled || !humanId}
          className="w-[108px] shrink-0"
        />

        {/* Trait checkboxes — canonical order; book-gated-off = disabled. */}
        <div className="flex shrink-0 items-center gap-x-2.5">
          {TRAIT_TYPES.map((type) => {
            const gated = bookGateOf(bookChar, type);
            const supported = visualSupports(type);
            const checked = traits.find((t) => t.type === type)?.is_enabled ?? false;
            const disabled = !traitsInteractive || !gated || !supported;
            return (
              <label
                key={type}
                className={cn(
                  'flex items-center gap-1 text-xs',
                  disabled && 'opacity-50',
                )}
                title={
                  !gated
                    ? 'Disabled in book remix settings'
                    : traitsInteractive && !supported
                      ? 'This visual has no data for this trait'
                      : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={checked && gated && supported}
                  disabled={disabled}
                  onChange={(e) => toggleTrait(type, e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                {TRAIT_LABELS[type]}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
