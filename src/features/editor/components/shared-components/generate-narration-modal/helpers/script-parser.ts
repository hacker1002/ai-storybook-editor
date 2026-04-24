// script-parser.ts — Parse DB-form narration scripts into per-speaker turns.
// DB form: lines prefixed with `@{speaker_key}: content [tags]`.
// Spec: ai-storybook-design/component/editor-page/objects-creative-space/07-generate-narration-modal.md §4.2

/** Regex for `@speaker_key:` mentions at line start. Multiline + dotAll so
 *  content can span lines until the next mention or end of input. */
export const DB_MENTION_PATTERN = /^@([a-z][a-z0-9_]*):\s*(.+?)(?=^@[a-z][a-z0-9_]*:|$)/gms;

export interface Turn {
  speakerKey: string;
  text: string;
}

/**
 * Split a script into an ordered list of turns. Turns with empty text are
 * skipped. Non-matching prefix text (before the first `@key:`) is ignored.
 */
export function parseTurns(script: string): Turn[] {
  if (!script) return [];
  const turns: Turn[] = [];
  // `matchAll` requires a global regex, ours has the `g` flag.
  for (const match of script.matchAll(DB_MENTION_PATTERN)) {
    const speakerKey = match[1];
    const text = (match[2] ?? '').trim();
    if (!text) continue;
    turns.push({ speakerKey, text });
  }
  return turns;
}
