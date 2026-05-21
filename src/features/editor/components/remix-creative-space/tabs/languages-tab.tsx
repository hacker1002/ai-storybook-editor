// languages-tab.tsx — Languages section. Toggle list keyed by language code.

import type { RemixLanguageEntry } from '@/types/editor';
import type { RemixLanguageChoice } from '@/types/remix';
import { LanguageRow } from './language-row';

interface Props {
  allowedLangs: RemixLanguageEntry[];
  draftLanguages: RemixLanguageChoice[];
  onUpsert: (code: string, patch: Partial<RemixLanguageChoice>) => void;
}

export function LanguagesTab({ allowedLangs, draftLanguages, onUpsert }: Props) {
  if (allowedLangs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No languages enabled in book remix settings.
      </p>
    );
  }

  return (
    <div className="mx-auto mt-6 max-w-xs space-y-3">
      {allowedLangs.map((lang) => (
        <LanguageRow
          key={lang.code}
          name={lang.name}
          code={lang.code}
          entry={draftLanguages.find((l) => l.code === lang.code)}
          onUpsert={(patch) => onUpsert(lang.code, patch)}
        />
      ))}
    </div>
  );
}
