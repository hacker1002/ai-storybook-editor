// character-swap-row.tsx — One character row in the Characters tab.
// Header: enable switch, name, Human → Visual cascade, 5 trait checkboxes,
// Swap button. Body (when open): BEFORE/AFTER compare or swap status.
//
// Enable chain: Human → Visual → Traits + Swap. Traits render in canonical
// TRAIT_TYPES order; a book-gated-off trait is shown disabled. Swap guard:
// enabled + human + visual + ≥1 enabled trait + not loading.

import { ChevronRight, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from '@/components/ui/searchable-dropdown';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { TRAIT_TYPES, TRAIT_LABELS } from '@/constants/trait-constants';
import type { TraitType } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixCharacterChoice, RemixTraitChoice, SwapPreviewState } from '@/types/remix';
import { BeforeAfterCompare } from './before-after-compare';

const log = createLogger('Editor', 'CharacterSwapRow');

interface Props {
  bookChar: RemixCharacterEntry;
  entry: RemixCharacterChoice | undefined;
  humanOptions: SearchableDropdownOption[];
  visualOptions: SearchableDropdownOption[];
  /** Traits the selected visual can swap (non-empty description); null = no visual yet. */
  supportedTraits: Set<TraitType> | null;
  swapState: SwapPreviewState;
  /** Character's current base-sheet visual (pre-swap) — shown when not yet swapped. */
  currentVisualUrl: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  onUpsert: (patch: Partial<RemixCharacterChoice>) => void;
  onChangeHuman: (humanId: string) => void;
  onSwap: () => void;
}

/** Book-level gate per trait — a trait the book disabled cannot be swapped. */
function bookGateOf(bookChar: RemixCharacterEntry, type: TraitType): boolean {
  return bookChar.traits.find((t) => t.type === type)?.is_enabled ?? true;
}

export function CharacterSwapRow({
  bookChar,
  entry,
  humanOptions,
  visualOptions,
  supportedTraits,
  swapState,
  currentVisualUrl,
  isOpen,
  onToggleOpen,
  onUpsert,
  onChangeHuman,
  onSwap,
}: Props) {
  const enabled = entry?.is_enabled ?? false;
  const humanId = entry?.human_id ?? null;
  const visual = entry?.visual ?? null;
  const traits = entry?.traits ?? [];
  const loading = swapState.status === 'loading';

  const traitsInteractive = enabled && !!humanId && !!visual;

  // A visual profile only swaps traits it has a description for. Once a visual is
  // picked, traits it doesn't support are disabled so the user can't enable them.
  const visualSupports = (type: TraitType) =>
    supportedTraits ? supportedTraits.has(type) : true;

  const toggleTrait = (type: TraitType, checked: boolean) => {
    log.debug('toggleTrait', 'change', { key: bookChar.key, type, checked });
    const next: RemixTraitChoice[] = TRAIT_TYPES.map((t) => {
      if (t === type) return { type: t, is_enabled: checked };
      return (
        traits.find((x) => x.type === t) ?? { type: t, is_enabled: true }
      );
    });
    onUpsert({ traits: next });
  };

  const anyTraitEnabled = TRAIT_TYPES.some(
    (t) =>
      bookGateOf(bookChar, t) &&
      visualSupports(t) &&
      (traits.find((x) => x.type === t)?.is_enabled ?? false),
  );

  const canSwap = enabled && !!humanId && !!visual && anyTraitEnabled && !loading;

  // Whole-row click toggles the accordion, except when the click originates
  // from an interactive control (switch, dropdowns, trait checkboxes, buttons).
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Dropdown options render in a Radix portal: clicks bubble through the React
    // tree but live outside this row in the DOM. Ignore them (they'd otherwise
    // collapse the row when an option is picked).
    if (!e.currentTarget.contains(target)) return;
    if (
      target.closest(
        'button, a, input, select, textarea, label, [role="combobox"], [role="switch"]',
      )
    ) {
      return;
    }
    onToggleOpen();
  };

  return (
    <div className={cn('rounded-md border', !enabled && 'opacity-60')}>
      <div
        className="flex cursor-pointer items-center gap-2 p-3"
        onClick={handleRowClick}
      >
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onUpsert({ is_enabled: v })}
          aria-label={`Toggle ${bookChar.name}`}
        />
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          aria-expanded={isOpen}
          className="shrink-0 rounded p-1 hover:bg-accent"
        >
          <ChevronRight
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')}
          />
        </button>
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
          // Changing the visual invalidates any prior swap result.
          onChange={(v) => onUpsert({ visual: v, base_image_url: null })}
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
                      ? 'This visual has no data for this trait — cannot swap'
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

        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
        <Button
          size="sm"
          onClick={onSwap}
          disabled={!canSwap}
          aria-busy={loading}
          className="shrink-0"
          title={
            !humanId
              ? 'Pick a human first'
              : !visual
                ? 'Pick a visual first'
                : !anyTraitEnabled
                  ? 'Enable at least one trait'
                  : 'Swap appearance'
          }
        >
          Swap
        </Button>
      </div>

      {isOpen && (
        <div className="border-t p-3">
          <SwapBody swapState={swapState} currentVisualUrl={currentVisualUrl} />
        </div>
      )}
    </div>
  );
}

function SwapBody({
  swapState,
  currentVisualUrl,
}: {
  swapState: SwapPreviewState;
  currentVisualUrl: string | null;
}) {
  const loading = swapState.status === 'loading';

  if (swapState.status === 'error') {
    return (
      <p className="py-3 text-sm text-destructive" role="alert">
        {swapState.errorMessage ?? 'Swap failed. Please retry.'}
      </p>
    );
  }
  // Swapped: BEFORE (old visual) vs AFTER (base_image_url) compare slider.
  if (swapState.status === 'done' && swapState.beforeUrl && swapState.afterUrl) {
    return (
      <div className="space-y-1.5">
        <BeforeAfterCompare
          beforeUrl={swapState.beforeUrl}
          afterUrl={swapState.afterUrl}
          className="h-[360px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Re-swap to update the preview after changing human, visual, or traits.
        </p>
      </div>
    );
  }

  // Idle / loading: keep the current (old) visual visible; overlay the loader
  // on top of it while swapping rather than replacing the whole body.
  const baseUrl = swapState.beforeUrl ?? currentVisualUrl;
  if (baseUrl) {
    return (
      <div className="space-y-1.5">
        <div className="relative h-[360px] w-full overflow-hidden rounded-md bg-muted">
          <img
            src={baseUrl}
            alt="Current character visual"
            draggable={false}
            className="block h-full w-full object-contain"
          />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            CURRENT
          </span>
          {loading && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              Swapping appearance… (this can take ~20–40s)
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {loading
            ? 'Generating swap preview — this stays put until it finishes.'
            : 'Pick a human and visual, select traits, then Swap to preview the result.'}
        </p>
      </div>
    );
  }

  // No base image available (rare) — fall back to a plain loader / hint.
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Swapping appearance… (this can take ~20–40s)
      </div>
    );
  }
  return (
    <p className="py-3 text-sm text-muted-foreground">
      Pick a human and visual, select traits, then Swap to preview the result.
    </p>
  );
}
