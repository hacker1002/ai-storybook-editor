// escape-regexp.ts — Escape regex special chars for safe literal-string regex construction.

/** Escape MDN-listed regex special chars: . * + ? ^ $ { } ( ) | [ ] \ */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
