// voices-tab.tsx — Voices section. Rows = draft.voices (book-allowed). Per-character
// voices render first (book order); the narrator row is pinned last. All voices
// are offered in the dropdown (no per-row filter).

import { useVoicesStore } from '@/stores/voices-store';
import type { SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { NARRATOR_VOICE_KEY } from '@/constants/config-constants';
import type { RemixVoiceChoice } from '@/types/remix';
import { VoiceRow } from './voice-row';

interface Props {
  draftVoices: RemixVoiceChoice[];
  onUpsert: (key: string, patch: Partial<RemixVoiceChoice>) => void;
}

export function VoicesTab({ draftVoices, onUpsert }: Props) {
  const voices = useVoicesStore((s) => s.voices);
  const voiceOptions: SearchableDropdownOption[] = voices.map((v) => ({
    value: v.id,
    label: v.name,
  }));

  if (draftVoices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No voices enabled in book remix settings.
      </p>
    );
  }

  // Characters first (preserve book order), narrator pinned last.
  const characters = draftVoices.filter((v) => v.key !== NARRATOR_VOICE_KEY);
  const narrator = draftVoices.find((v) => v.key === NARRATOR_VOICE_KEY);
  const ordered = narrator ? [...characters, narrator] : characters;

  return (
    <div className="space-y-2">
      {ordered.map((entry) => (
        <VoiceRow
          key={entry.key}
          entry={entry}
          voiceOptions={voiceOptions}
          isNarrator={entry.key === NARRATOR_VOICE_KEY}
          onUpsert={(patch) => onUpsert(entry.key, patch)}
        />
      ))}
    </div>
  );
}
