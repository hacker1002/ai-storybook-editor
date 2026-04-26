// script-editor.tsx — Controlled textarea + @-mention autocomplete.
// Renders plain DB-form script (e.g. `@narrator: hello`) and opens a
// MentionPopover when the user is mid-mention at the caret.

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { createLogger } from '@/utils/logger';
import type { Character } from '@/types/character-types';
import type { NarratorSettings } from '@/types/editor';
import { MentionPopover } from './mention-popover';
import type { MentionPopoverHandle } from './mention-popover';
import { useMentionAnchor } from './use-mention-anchor';

const log = createLogger('NarrationScriptEditor', 'Component');

const MENTION_TOKEN_REGEX = /^[a-z0-9_]*$/;

export interface ScriptEditorProps {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  narrator: NarratorSettings | null;
  characters: Character[];
  currentLanguage: string;
  placeholder?: string;
  maxLength?: number;
}

interface MentionState {
  /** Index of the `@` that started the current mention context. */
  atIndex: number;
  /** Current filter substring (chars typed after the `@`). */
  filter: string;
}

/**
 * Detect whether the caret sits inside a mention context. Returns null if
 * not in a mention — caller closes the popover.
 *
 * Rules:
 *  - Find nearest `@` before caret in the text.
 *  - Preceding char must be start-of-string / whitespace / newline (not a
 *    word char) so we don't false-fire on emails/compound tokens.
 *  - Substring `[atIndex+1 .. caret]` must match `^[a-z0-9_]*$` (valid key
 *    characters). Anything else (space, newline, `:`) terminates.
 */
function detectMentionContext(value: string, caret: number): MentionState | null {
  const before = value.slice(0, caret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;
  const prev = before[atIndex - 1];
  if (prev != null && !/\s/.test(prev)) return null;
  const token = before.slice(atIndex + 1);
  if (!MENTION_TOKEN_REGEX.test(token)) return null;
  return { atIndex, filter: token };
}

export function ScriptEditor({
  value,
  onChange,
  onCommit,
  narrator,
  characters,
  currentLanguage,
  placeholder,
  maxLength,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<MentionPopoverHandle>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const { virtualAnchor, updateAnchor } = useMentionAnchor(textareaRef);

  // Evaluate mention context after every value/caret change.
  const evaluateMention = useCallback(
    (nextValue: string, caret: number) => {
      const ctx = detectMentionContext(nextValue, caret);
      if (!ctx) {
        if (mention) {
          log.debug('evaluateMention', 'close popover', {});
          setMention(null);
        }
        return;
      }
      updateAnchor(caret);
      setMention((prev) => {
        if (!prev) {
          log.debug('evaluateMention', 'open popover', {
            filterLength: ctx.filter.length,
          });
        }
        return ctx;
      });
    },
    [mention, updateAnchor],
  );

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    evaluateMention(next, e.target.selectionStart ?? next.length);
  };

  const handleSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    evaluateMention(ta.value, ta.selectionStart ?? 0);
  };

  const closeMention = useCallback(() => setMention(null), []);

  // Replace the existing `@<key>(:\s?)?` token at the mention site with
  // `@{speakerKey}: `. Extends past the caret so picking from the dropdown
  // while the caret sits mid-key (e.g. `@nar|rator: text`) replaces the full
  // existing token instead of stranding the tail.
  const insertMention = useCallback(
    (speakerKey: string) => {
      const ta = textareaRef.current;
      if (!ta || !mention) return;
      const start = mention.atIndex;
      const tail = value.slice(start);
      const tokenMatch = tail.match(/^@[a-z0-9_]*(?::\s?)?/);
      const end = start + (tokenMatch ? tokenMatch[0].length : 1 + mention.filter.length);
      const before = value.slice(0, start);
      const after = value.slice(end);
      const insertion = `@${speakerKey}: `;
      const next = `${before}${insertion}${after}`;
      const nextCaret = before.length + insertion.length;
      onChange(next);
      setMention(null);
      // Restore caret in next tick so the textarea has the new value mounted.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      });
      log.debug('insertMention', 'inserted speaker key', { speakerKey });
    },
    [mention, onChange, value],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention) return;
    const handle = popoverRef.current;
    if (!handle || handle.itemCount() === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        handle.moveDown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        handle.moveUp();
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        handle.confirm();
        break;
      case 'Escape':
        e.preventDefault();
        closeMention();
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative w-full">
      <Textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
        className="min-h-[200px] font-mono text-sm"
      />
      <MentionPopover
        ref={popoverRef}
        open={mention != null}
        anchor={virtualAnchor}
        filter={mention?.filter ?? ''}
        narrator={narrator}
        characters={characters}
        currentLanguage={currentLanguage}
        onSelect={insertMention}
        onClose={closeMention}
      />
    </div>
  );
}
