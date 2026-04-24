// textbox-helpers.ts - Shared utilities for textbox data access

import { createLogger } from '@/utils/logger';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import type { SpreadTextboxContent, Typography } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';

const log = createLogger('Util', 'TextboxHelpers');

/** Meta keys that are not language content. */
const META_KEYS = ['id', 'title', 'order'];

/** Extract all language keys from a textbox (filters out meta keys). */
function getLangKeys(textbox: Record<string, unknown>): string[] {
  return Object.keys(textbox).filter(
    k => !META_KEYS.includes(k) && typeof textbox[k] === 'object'
  );
}

/**
 * Get first language key from textbox object.
 * Filters out meta keys (id, title, order) and returns first object-type key.
 */
export function getFirstTextboxKey(textbox: Record<string, unknown>): string | null {
  const langKeys = getLangKeys(textbox);
  if (!langKeys[0]) {
    log.warn('getFirstTextboxKey', 'no lang key found', { keys: Object.keys(textbox) });
  }
  return langKeys[0] ?? null;
}

/**
 * Get textbox content for the given language code.
 * - If langCode exists → returns existing content as-is.
 * - If langCode doesn't exist → clones a new empty entry: geometry copied
 *   from the first available language (layout intent preserved), typography
 *   resolved from `bookTypography[langCode]` when provided (narration
 *   settings) else copied from fallback, text empty, audio reset.
 * - Returns null only when the textbox has zero language keys.
 *
 * Pass `bookTypography` at call sites that render or persist the result so
 * new-language entries inherit per-language narration config instead of the
 * previously-authored language's typography.
 */
export function getTextboxContentForLanguage(
  textbox: Record<string, unknown>,
  langCode: string,
  bookTypography?: Record<string, TypographySettings> | null
): { langKey: string; content: SpreadTextboxContent } | null {
  const langKeys = getLangKeys(textbox);

  // Exact match — return existing content
  if (langKeys.includes(langCode)) {
    return { langKey: langCode, content: textbox[langCode] as SpreadTextboxContent };
  }

  // Clone empty entry from first available language
  const fallbackKey = langKeys[0];
  if (fallbackKey) {
    const fallback = textbox[fallbackKey] as SpreadTextboxContent;
    const typography: Typography = bookTypography?.[langCode]
      ? mapTypographyToTextbox(bookTypography[langCode])
      : bookTypography === undefined
        ? { ...fallback.typography }
        : mapTypographyToTextbox(DEFAULT_TYPOGRAPHY);
    log.debug('getTextboxContentForLanguage', 'cloned empty entry', {
      langCode,
      fallback: fallbackKey,
      typographySource: bookTypography?.[langCode]
        ? 'book'
        : bookTypography === undefined
          ? 'fallback'
          : 'default',
    });
    return {
      langKey: langCode,
      content: {
        text: '',
        geometry: { ...fallback.geometry },
        typography,
        audio: {
          script: '',
          settings: {
            model: 'eleven_v3',
            stability: 0.5,
            similarity: 0.75,
            style_exaggeration: 0,
            speed: 1.0,
            speaker_boost: true,
            seed: null,
          },
          media: null,
        },
      },
    };
  }

  log.warn('getTextboxContentForLanguage', 'no lang key found', { langCode, keys: Object.keys(textbox) });
  return null;
}
