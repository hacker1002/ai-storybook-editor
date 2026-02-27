// textbox-helpers.ts - Shared utilities for textbox data access

/**
 * Get first language key from textbox object.
 * Data is pre-filtered to single language by consumer.
 */
export function getFirstTextboxKey(textbox: Record<string, unknown>): string | null {
  const metaKeys = ['id', 'title', 'order'];
  const langKeys = Object.keys(textbox).filter(
    k => !metaKeys.includes(k) && typeof textbox[k] === 'object'
  );
  return langKeys[0] ?? null;
}
