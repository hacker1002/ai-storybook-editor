// textbox-helpers.ts - Shared utilities for textbox data access

import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'TextboxHelpers');

/**
 * Get first language key from textbox object.
 * Filters out meta keys (id, title, order) and returns first object-type key.
 */
export function getFirstTextboxKey(textbox: Record<string, unknown>): string | null {
  const metaKeys = ['id', 'title', 'order'];
  const langKeys = Object.keys(textbox).filter(
    k => !metaKeys.includes(k) && typeof textbox[k] === 'object'
  );
  if (!langKeys[0]) {
    log.warn('getFirstTextboxKey', 'no lang key found', { keys: Object.keys(textbox) });
  }
  return langKeys[0] ?? null;
}
