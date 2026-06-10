// characters-tab.tsx — Characters section of the remix config modal.
// Renders one CharacterSwapRow per book-allowed character; derives per-row
// Human/Visual options. Config-only (human/visual/traits) — the appearance swap
// itself is an async job triggered from the swap crop-sheet modal, not here.

import type { SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import type { Human } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixCharacterChoice } from '@/types/remix';
import {
  maxTraitChoicesFor,
  supportedTraitSetFor,
} from '../remix-config-normalize';
import { CharacterSwapRow } from './character-swap-row';
import type { VisualProfileOption } from './visual-profile-dropdown';

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

  const visualOptionsFor = (humanId: string | null): VisualProfileOption[] => {
    if (!humanId) return [];
    const human = humans.find((h) => h.id === humanId);
    return (
      human?.visualProfiles.map((vp) => ({
        value: vp.name,
        label: vp.name,
        thumbnail: vp.convertedImage ?? vp.nobgImage ?? vp.rawImages[0] ?? null,
      })) ?? []
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
            // Shared predicate (remix-config-normalize) — the same support set
            // masks traits when the draft is normalized on save (WYSIWYG).
            supportedTraits={supportedTraitSetFor(
              humans,
              entry?.human_id ?? null,
              entry?.visual ?? null,
            )}
            onUpsert={(patch) => onUpsert(bookChar.key, patch)}
            onChangeHuman={(humanId) =>
              // Cascade: changing the human clears the visual (visual options
              // depend on the selected human) AND resets traits to the maximum
              // checkable set (no profile yet → book gate only). Prior ticks
              // are discarded by design (product call 2026-06-10).
              onUpsert(bookChar.key, {
                human_id: humanId,
                visual: null,
                traits: maxTraitChoicesFor(bookChar, null),
              })
            }
            onChangeVisual={(visual) =>
              // Picking a visual resets traits to everything that profile can
              // swap (∧ book gate) — default-max, prior ticks discarded.
              onUpsert(bookChar.key, {
                visual,
                traits: maxTraitChoicesFor(
                  bookChar,
                  supportedTraitSetFor(humans, entry?.human_id ?? null, visual),
                ),
              })
            }
          />
        );
      })}
    </div>
  );
}
