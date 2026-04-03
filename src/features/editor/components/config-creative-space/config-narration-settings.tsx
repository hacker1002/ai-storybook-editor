// config-narration-settings.tsx - Narration settings panel for 5 fixed languages.
// Configures default voice-over (placeholder) and textbox typography per language.

import * as React from 'react';
import { useCurrentBook, useBookTypography, useBookActions } from '@/stores/book-store';
import { NARRATION_LANGUAGES, DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import { NarrationLanguageSection } from './narration-language-section';
import type { TypographySettings } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigNarrationSettings');

export function ConfigNarrationSettings() {
  const book = useCurrentBook();
  const typography = useBookTypography();
  const { updateBook } = useBookActions();

  if (!book) return null;

  const handleTypographyChange = (langCode: string, updates: Partial<TypographySettings>) => {
    const current = typography?.[langCode] ?? DEFAULT_TYPOGRAPHY;
    const updated = { ...current, ...updates };
    const nextTypography = { ...(typography ?? {}), [langCode]: updated };

    log.info('handleTypographyChange', 'updating', { langCode, keys: Object.keys(updates) });
    void updateBook(book.id, { typography: nextTypography });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Narration Settings</h3>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-4">
      {NARRATION_LANGUAGES.map((lang) => (
        <NarrationLanguageSection
          key={lang.code}
          langCode={lang.code}
          langLabel={lang.label}
          typography={typography?.[lang.code] ?? DEFAULT_TYPOGRAPHY}
          onChange={handleTypographyChange}
        />
      ))}
      </div>
    </div>
  );
}
