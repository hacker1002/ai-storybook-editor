"use client";

// enhanced-script-textarea.tsx
// Textarea with @-mention dropdown for picking a Reader (narrator + characters).
// Triggers when caret sits inside the `@<key>` portion of a line-anchored tag.
// Excluded by design: caret on/after the `:` separator (user is editing the
// dialog body, not the reader). Hover highlights an option; click selects it.

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/utils";
import { createLogger } from "@/utils/logger";
import { NARRATOR_KEY, type Reader } from "@/apis/text-api";

const log = createLogger("UI", "EnhancedScriptTextarea");

// Line-anchored tag: `@`, optional key chars (allow empty so trigger fires right after `@`),
// optional colon. Key alphabet matches `READER_KEY_REGEX` (a-z, 0-9, _).
const TAG_RE = /^@([a-z0-9_]*)(:)?/i;

interface MentionState {
  query: string;
  lineStart: number;
  tagEnd: number; // absolute index just past `@<key>[:]?`
  hasColon: boolean;
}

export interface EnhancedScriptTextareaProps {
  value: string;
  onChange: (next: string) => void;
  readers: Reader[];
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

function getCurrentLine(text: string, caret: number): { ls: number; line: string } {
  const ls = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const leRaw = text.indexOf("\n", caret);
  const le = leRaw === -1 ? text.length : leRaw;
  return { ls, line: text.slice(ls, le) };
}

function detectMention(text: string, caret: number): MentionState | null {
  const { ls, line } = getCurrentLine(text, caret);
  const m = TAG_RE.exec(line);
  if (!m) return null;
  const keyLen = (m[1] ?? "").length;
  // Just past the key, before the optional `:`. Caret here = "end of key", still suggestable.
  const keyEnd = ls + 1 + keyLen;
  const tagEnd = ls + m[0].length;
  // Only trigger when caret sits in the `@<key>` window. Excludes positions
  // before `@`, on the `:` itself, and after the colon (dialog body region).
  if (caret < ls + 1 || caret > keyEnd) return null;
  return {
    query: m[1] ?? "",
    lineStart: ls,
    tagEnd,
    hasColon: m[2] === ":",
  };
}

function applyReader(
  text: string,
  mention: MentionState,
  newKey: string,
): { next: string; caret: number } {
  const replacement = `@${newKey}:`;
  // Add trailing space unless one is already there. Keeps `@key: text` format consistent
  // for the script parser, regardless of whether we're inserting fresh or swapping existing.
  const needsSpace = text[mention.tagEnd] !== " ";
  const suffix = needsSpace ? " " : "";
  const next =
    text.slice(0, mention.lineStart) +
    replacement +
    suffix +
    text.slice(mention.tagEnd);
  return {
    next,
    caret: mention.lineStart + replacement.length + suffix.length,
  };
}

export function EnhancedScriptTextarea({
  value,
  onChange,
  readers,
  disabled,
  placeholder,
  ariaLabel,
  className,
}: EnhancedScriptTextareaProps) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = React.useState<MentionState | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [pos, setPos] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const filtered = React.useMemo(() => {
    if (!mention) return [];
    // hasColon = user clicked into an existing complete tag → show all readers so they
    // can swap to any. Without colon = user is typing the key fresh → filter by prefix.
    if (mention.hasColon) return readers;
    const q = mention.query.toLowerCase();
    if (q === "") return readers;
    return readers.filter((r) => r.key.toLowerCase().startsWith(q));
  }, [mention, readers]);

  React.useEffect(() => {
    if (filtered.length > 0 && activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered, activeIdx]);

  // Recompute dropdown position relative to the textarea on open + on scroll/resize.
  React.useLayoutEffect(() => {
    if (!mention || !taRef.current) {
      setPos(null);
      return;
    }
    const el = taRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mention]);

  const refreshMention = React.useCallback(
    (nextValue: string, caret: number) => {
      setMention(detectMention(nextValue, caret));
    },
    [],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    refreshMention(v, e.target.selectionStart);
  };

  const handleSelect = React.useCallback(
    (key: string) => {
      if (!mention) return;
      const { next, caret } = applyReader(value, mention, key);
      log.debug("handleSelect", "reader picked", {
        newKey: key,
        oldKey: mention.query,
        replacedExisting: mention.query !== "",
      });
      onChange(next);
      setMention(null);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [mention, value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(filtered[activeIdx].key);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMention(null);
        return;
      }
    }
    // Stop modal-level Escape close + row-toggle bubbling.
    e.stopPropagation();
  };

  const handleSyncFromCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    refreshMention(el.value, el.selectionStart);
  };

  const handleClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    handleSyncFromCaret(e);
  };

  const handleBlur = () => {
    // mousedown on dropdown items is preventDefault'd → textarea stays focused while
    // user picks. Real outside-clicks blur the textarea → close.
    setMention(null);
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSyncFromCaret}
        onClick={handleClick}
        onFocus={handleSyncFromCaret}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "w-full min-h-[3.5rem] resize-none rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-60",
          className,
        )}
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      {mention && filtered.length > 0 && pos
        ? createPortal(
            <ul
              role="listbox"
              aria-label="Choose reader"
              className="max-h-60 overflow-y-auto rounded-md border bg-popover py-1 text-sm text-popover-foreground shadow-md"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: Math.max(pos.width, 220),
                zIndex: 100,
                // Radix Dialog applies `pointer-events:none` on <body>; pointer-events
                // INHERITS, so our portaled listbox would compute to `none` and clicks
                // would pass through to the dialog content beneath. Force-enable.
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => {
                // Keep textarea focused while clicking dropdown items.
                e.preventDefault();
              }}
            >
              {filtered.map((r, i) => {
                const isActive = i === activeIdx;
                const isNarrator = r.key === NARRATOR_KEY;
                return (
                  <li
                    key={r.key}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => {
                      // Use mousedown (not click): fires BEFORE textarea blur, so `mention`
                      // is still valid. preventDefault keeps focus on textarea (handleBlur
                      // wouldn't be racing us anyway, but cleaner). stopPropagation blocks
                      // the React-tree bubble to row's <tr onClick> (toggle checkbox).
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(r.key);
                    }}
                    className={cn(
                      "flex cursor-pointer items-baseline gap-2 px-3 py-1.5",
                      isActive && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      @{r.key}
                    </span>
                    {r.name ? (
                      <span className="truncate">{r.name}</span>
                    ) : null}
                    {isNarrator ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Narrator
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
