// textbox-helpers.ts - Shared utilities for textbox data access

/**
 * Get first language key from textbox object.
 * Filters out meta keys (id, title, order) and returns first object-type key.
 */
export function getFirstTextboxKey(textbox: Record<string, unknown>): string | null {
  const metaKeys = ['id', 'title', 'order'];
  const langKeys = Object.keys(textbox).filter(
    k => !metaKeys.includes(k) && typeof textbox[k] === 'object'
  );
  return langKeys[0] ?? null;
}
