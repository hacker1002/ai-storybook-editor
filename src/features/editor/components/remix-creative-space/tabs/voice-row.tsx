// voice-row.tsx — One voice row (narrator or per-character). Switch + name +
// voice dropdown (ALL voices, no filter). Narrator additionally gets an editable
// Name input; character names are read-only (materialized from the book).
// Toggling OFF preserves voice_id (only flips is_enabled).

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { cn } from '@/utils/utils';
import type { RemixVoiceChoice } from '@/types/remix';

interface Props {
  entry: RemixVoiceChoice;
  voiceOptions: SearchableDropdownOption[];
  isNarrator: boolean;
  onUpsert: (patch: Partial<RemixVoiceChoice>) => void;
}

export function VoiceRow({ entry, voiceOptions, isNarrator, onUpsert }: Props) {
  const enabled = entry.is_enabled;
  // Narrator shows a fixed "Narrator" label + @narrator key; its custom display
  // name is edited via the separate "Enter name" input. Characters are read-only.
  const displayName = isNarrator ? 'Narrator' : entry.name;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border p-3',
        !enabled && 'opacity-60',
      )}
    >
      <Switch
        checked={enabled}
        onCheckedChange={(v) => onUpsert({ is_enabled: v })}
        aria-label={`Toggle ${displayName} voice`}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {displayName}
        </div>
        <div className="truncate text-xs leading-tight text-muted-foreground">
          @{entry.key}
        </div>
      </div>

      {isNarrator && (
        <Input
          value={entry.name}
          onChange={(e) => onUpsert({ name: e.target.value })}
          placeholder="Enter name"
          disabled={!enabled}
          className="w-[200px] shrink-0"
          aria-label="Narrator name"
        />
      )}

      <SearchableDropdown
        options={voiceOptions}
        value={entry.voice_id}
        onChange={(id) => onUpsert({ voice_id: id })}
        placeholder="Voice"
        disabled={!enabled}
        className="w-[280px] shrink-0"
      />
    </div>
  );
}
