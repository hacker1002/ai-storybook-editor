// textbox-helpers.ts - Shared utilities for textbox data access

import { createLogger } from '@/utils/logger';
import type { SpreadTextboxContent } from '@/types/spread-types';

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
 * - If langCode doesn't exist → clones a new empty entry from the first
 *   available language (geometry + typography copied, text empty, audio reset).
 * - Returns null only when the textbox has zero language keys.
 *
 * Callers always receive `{ langKey: langCode, content }` and can use it
 * directly without branching on exact/fallback.
 */
export function getTextboxContentForLanguage(
  textbox: Record<string, unknown>,
  langCode: string
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
    log.debug('getTextboxContentForLanguage', 'cloned empty entry from fallback', { langCode, fallback: fallbackKey });
    return {
      langKey: langCode,
      content: {
        text: '',
        geometry: { ...fallback.geometry },
        typography: { ...fallback.typography },
        audio: { script: '', speed: 1, emotion: 'neutral', media: [] },
      },
    };
  }

  log.warn('getTextboxContentForLanguage', 'no lang key found', { langCode, keys: Object.keys(textbox) });
  return null;
}
