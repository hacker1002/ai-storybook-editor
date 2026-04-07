// multi-lang-helpers.ts - Utilities for resolving JSONB multi-lang name fields.

import { createLogger } from '@/utils/logger';

const log = createLogger('Utils', 'MultiLangHelpers');

/**
 * Resolve a display name from a JSONB multi-lang name object.
 * Priority: exact langCode → first available key → "—"
 */
export function resolveMultiLangName(
  name: Record<string, string> | null | undefined,
  langCode: string
): string {
  if (!name) {
    log.debug('resolveMultiLangName', 'null/undefined name, returning fallback');
    return '—';
  }

  if (name[langCode]) {
    return name[langCode];
  }

  const firstValue = Object.values(name)[0];
  if (firstValue) {
    log.debug('resolveMultiLangName', 'exact lang not found, using first value', { langCode });
    return firstValue;
  }

  return '—';
}
