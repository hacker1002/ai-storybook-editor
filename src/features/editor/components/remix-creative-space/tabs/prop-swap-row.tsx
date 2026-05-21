// prop-swap-row.tsx — One prop row. Mirrors CharacterSwapRow (Item → Visual
// cascade) but has no traits/voice and no live swap: the items library has not
// shipped, so Item/Visual options are empty and Swap is disabled.

import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { cn } from '@/utils/utils';
import type { RemixPropEntry } from '@/types/editor';
import type { RemixPropChoice } from '@/types/remix';

interface Props {
  bookProp: RemixPropEntry;
  entry: RemixPropChoice | undefined;
  onUpsert: (patch: Partial<RemixPropChoice>) => void;
}

export function PropSwapRow({ bookProp, entry, onUpsert }: Props) {
  const enabled = entry?.is_enabled ?? false;
  const propId = entry?.prop_id ?? null;

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
        aria-label={`Toggle ${bookProp.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {bookProp.name}
        </div>
        <div className="truncate text-xs leading-tight text-muted-foreground">
          @{bookProp.key}
        </div>
      </div>

      {/* Items library TBD — options empty, swap disabled. Cascade kept for the
          future: changing item resets the visual. */}
      <SearchableDropdown
        options={[]}
        value={propId}
        onChange={(id) => onUpsert({ prop_id: id, visual: null })}
        placeholder="Item"
        disabled={!enabled}
        className="w-[140px] shrink-0"
      />
      <SearchableDropdown
        options={[]}
        value={entry?.visual ?? null}
        onChange={(v) => onUpsert({ visual: v })}
        placeholder={propId ? 'Visual' : 'Pick Item'}
        disabled={!enabled || !propId}
        className="w-[140px] shrink-0"
      />
      <Button size="sm" disabled title="Items library coming soon">
        Swap
      </Button>
    </div>
  );
}
