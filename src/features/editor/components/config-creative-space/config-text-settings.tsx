// config-text-settings.tsx - Text settings panel: textbox typography for 5 fixed languages.
// Voice-over moved to ConfigNarratorSettings (separate section).

import { useCurrentBook, useBookTypography, useBookActions } from '@/stores/book-store';
import { TEXT_LANGUAGES, DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import { TextLanguageSection } from './text-language-section';
import type { TypographySettings } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigTextSettings');

export function ConfigTextSettings() {
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
        <h3 className="text-sm font-semibold">Text Settings</h3>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-4">
      {TEXT_LANGUAGES.map((lang) => (
        <TextLanguageSection
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
