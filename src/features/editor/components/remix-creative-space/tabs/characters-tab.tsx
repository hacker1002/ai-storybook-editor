// characters-tab.tsx — Characters section of the remix config modal.
// Renders one CharacterSwapRow per book-allowed character; derives per-row
// Human/Visual options. Config-only (human/visual/traits) — the appearance swap
// itself is an async job triggered from the swap crop-sheet modal, not here.

import type { SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import type { Human, TraitType } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixCharacterChoice } from '@/types/remix';
import { CharacterSwapRow } from './character-swap-row';

interface Props {
  allowedChars: RemixCharacterEntry[];
  draftCharacters: RemixCharacterChoice[];
  humans: Human[];
  onUpsert: (key: string, patch: Partial<RemixCharacterChoice>) => void;
}

export function CharactersTab({
  allowedChars,
  draftCharacters,
  humans,
  onUpsert,
}: Props) {
  const humanOptions: SearchableDropdownOption[] = humans.map((h) => ({
    value: h.id,
    label: h.sourceName || h.id,
  }));

  const visualOptionsFor = (humanId: string | null): SearchableDropdownOption[] => {
    if (!humanId) return [];
    const human = humans.find((h) => h.id === humanId);
    return (
      human?.visualProfiles.map((vp) => ({ value: vp.name, label: vp.name })) ??
      []
    );
  };

  // Traits the selected visual profile can configure = traits with a non-empty
  // description. null when no human/visual is picked yet. Unsupported traits get
  // disabled in the row.
  const supportedTraitsFor = (
    humanId: string | null,
    visualName: string | null,
  ): Set<TraitType> | null => {
    if (!humanId || !visualName) return null;
    const profile = humans
      .find((h) => h.id === humanId)
      ?.visualProfiles.find((vp) => vp.name === visualName);
    if (!profile) return null;
    return new Set(
      profile.traits
        .filter((t) => typeof t.description === 'string' && t.description.length > 0)
        .map((t) => t.type),
    );
  };

  if (allowedChars.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No characters enabled in book remix settings.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {allowedChars.map((bookChar) => {
        const entry = draftCharacters.find((c) => c.key === bookChar.key);
        return (
          <CharacterSwapRow
            key={bookChar.key}
            bookChar={bookChar}
            entry={entry}
            humanOptions={humanOptions}
            visualOptions={visualOptionsFor(entry?.human_id ?? null)}
            supportedTraits={supportedTraitsFor(
              entry?.human_id ?? null,
              entry?.visual ?? null,
            )}
            onUpsert={(patch) => onUpsert(bookChar.key, patch)}
            onChangeHuman={(humanId) =>
              // Cascade: changing the human clears the visual (visual options
              // depend on the selected human).
              onUpsert(bookChar.key, { human_id: humanId, visual: null })
            }
          />
        );
      })}
    </div>
  );
}
