// use-mention-anchor.ts — Hidden mirror div technique to compute caret screen
// coordinates inside a <textarea>. The browser exposes `selectionStart` but not
// caret pixel position; we clone the textarea into an off-screen div styled
// identically, insert a marker span at the caret offset, then read its
// bounding rect. Standard pattern used by textcomplete / tribute.js.

import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'MentionAnchor');

// Style properties we need to copy from the textarea to the mirror div so
// text metrics match exactly. Keep this list conservative — every extra
// property is a chance for drift.
const COPIED_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
  'whiteSpace',
  'wordWrap',
  'overflowWrap',
] as const;

interface CaretRect {
  top: number;
  left: number;
  height: number;
}

/**
 * Compute viewport-relative caret rect for a textarea at a given index.
 * Uses an off-screen mirror div with copied styles and a marker span.
 */
function measureCaretRect(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): CaretRect {
  const doc = textarea.ownerDocument;
  const mirror = doc.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');

  const style = mirror.style;
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '0';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';

  const computed = window.getComputedStyle(textarea);
  for (const prop of COPIED_PROPERTIES) {
    // Copy each style prop verbatim. Cast required because style index sig.
    (style as unknown as Record<string, string>)[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
  }

  const value = textarea.value.substring(0, caretIndex);
  mirror.textContent = value;

  const marker = doc.createElement('span');
  // Zero-width space so the span has a measurable rect without affecting layout.
  marker.textContent = '​';
  mirror.appendChild(marker);

  doc.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top =
    textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
  const left =
    textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
  const height = markerRect.height || parseFloat(computed.lineHeight) || 16;

  doc.body.removeChild(mirror);

  return { top, left, height };
}

export interface MentionAnchorApi {
  /** Virtual anchor element compatible with Radix `PopoverAnchor`. */
  virtualAnchor: {
    getBoundingClientRect: () => DOMRect;
  };
  /** Recompute anchor position based on current textarea caret. */
  updateAnchor: (caretIndex: number) => void;
}

/**
 * Hook returning a virtual anchor whose rect tracks the caret of the given
 * textarea. Call `updateAnchor` whenever caret position or value changes
 * while a mention popover is open.
 */
export function useMentionAnchor(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): MentionAnchorApi {
  const rectRef = useRef<DOMRect>(
    typeof DOMRect !== 'undefined'
      ? new DOMRect(0, 0, 0, 0)
      : ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
  );

  const updateAnchor = useCallback(
    (caretIndex: number) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const { top, left, height } = measureCaretRect(ta, caretIndex);
      rectRef.current = new DOMRect(left, top, 1, height);
    },
    [textareaRef],
  );

  // Keep rect fresh across resizes/scrolls while anchor is in use.
  useEffect(() => {
    log.debug('setupAnchorListeners', 'attach resize/scroll handlers');
    const handler = () => {
      const ta = textareaRef.current;
      if (!ta) return;
      updateAnchor(ta.selectionStart ?? 0);
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [textareaRef, updateAnchor]);

  const virtualAnchor = {
    getBoundingClientRect: () => rectRef.current,
  };

  return { virtualAnchor, updateAnchor };
}
