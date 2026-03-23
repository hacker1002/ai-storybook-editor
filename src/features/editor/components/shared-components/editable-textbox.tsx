// editable-textbox.tsx - Shared utility component for editable text
'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/utils/utils';
import type { SpreadTextboxContent, WordTiming } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditableTextbox');

interface EditableTextboxProps {
  textboxContent: SpreadTextboxContent;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isSelectable: boolean;  // Controls click selection behavior
  isEditable: boolean;    // Controls double-click edit mode
  onSelect: (rect?: DOMRect) => void;
  onTextChange: (text: string) => void;
  onEditingChange: (isEditing: boolean) => void;
  /** Word-level timing data — when present, renders words in <span> elements for Read-Along */
  wordTimings?: WordTiming[];
}

export function EditableTextbox({
  textboxContent,
  index,
  zIndex,
  isSelected,
  isSelectable,
  isEditable,
  onSelect,
  onTextChange,
  onEditingChange,
  wordTimings,
}: EditableTextboxProps) {
  const { text, geometry, typography } = textboxContent;
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    onEditingChange(true);
    requestAnimationFrame(() => {
      if (editableRef.current) {
        editableRef.current.innerText = text;
        editableRef.current.focus();
        // Place cursor at end
        const selection = window.getSelection();
        const range = document.createRange();
        if (editableRef.current.childNodes.length > 0) {
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
    });
  }, [text, onEditingChange]);

  const exitEditMode = useCallback((save: boolean) => {
    if (save && editableRef.current) {
      const newText = editableRef.current.innerText;
      if (newText !== text) {
        onTextChange(newText);
      }
    }
    setIsEditing(false);
    onEditingChange(false);
  }, [text, onTextChange, onEditingChange]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isSelectable && !isEditing) {
      log.info('handleClick', 'textbox clicked', { index });
      const rect = e.currentTarget.getBoundingClientRect();
      onSelect(rect);
    }
  }, [isSelectable, isEditing, onSelect, index]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Allow direct edit mode entry when editable, even if not pre-selected
    // This enables remix-editor pattern where double-click directly edits
    if (isEditable) {
      enterEditMode();
    }
  }, [isEditable, enterEditMode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isSelected && !isEditing && e.key === 'Enter') {
      e.preventDefault();
      enterEditMode();
    }
    if (isEditing) {
      if (e.key === 'Escape') {
        exitEditMode(false);
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        exitEditMode(true);
      }
      // Prevent Delete/Backspace from bubbling to canvas (which would delete the item)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
      }
    }
  }, [isSelected, isEditing, enterEditMode, exitEditMode]);

  const handleBlur = useCallback(() => {
    if (isEditing) {
      exitEditMode(true);
    }
  }, [isEditing, exitEditMode]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const plainText = e.clipboardData.getData('text/plain');

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(plainText));

    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  // Map typography to CSS
  const typographyStyle: React.CSSProperties = {
    fontFamily: typography?.family || 'inherit',
    fontSize: typography?.size ? `${typography.size}px` : 'inherit',
    fontWeight: typography?.weight || 'normal',
    fontStyle: typography?.style || 'normal',
    textAlign: typography?.textAlign || 'left',
    lineHeight: typography?.lineHeight || 1.5,
    letterSpacing: typography?.letterSpacing ? `${typography.letterSpacing}px` : 'inherit',
    color: typography?.color || 'inherit',
    textDecoration: typography?.decoration || 'none',
    textTransform: typography?.textTransform || 'none',
  };

  const isEmpty = !text;

  /** Render text with per-word <span> elements for Read-Along highlighting */
  const renderTextWithWordSpans = (textContent: string): React.ReactNode => {
    const tokens = textContent.split(/(\s+)/);
    let wordIndex = 0;
    return tokens.map((token, i) => {
      if (/^\s+$/.test(token)) {
        // Whitespace — render as-is (preserves line breaks with whitespace-pre-wrap)
        return <span key={`ws-${i}`}>{token}</span>;
      }
      const idx = wordIndex++;
      return (
        <span key={`w-${idx}`} data-word-index={idx} className="read-along-word">
          {token}
        </span>
      );
    });
  };

  return (
    <div
      {...(isSelectable && {
        role: 'textbox',
        'aria-label': `Textbox ${index + 1}`,
        'aria-multiline': 'true',
      })}
      data-textbox
      tabIndex={isSelectable ? 0 : -1}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute overflow-hidden',
        isSelectable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        zIndex,
        outlineColor: COLORS.HOVER_OUTLINE,
        ...typographyStyle,
      }}
    >
      {isEditing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onPaste={handlePaste}
          className="w-full h-full outline-none p-1"
          style={{ backgroundColor: COLORS.EDIT_MODE_BG }}
        />
      ) : isEmpty ? (
        <div
          className="w-full h-full flex items-center justify-center italic p-1"
          style={{ color: COLORS.PLACEHOLDER_TEXT }}
        >
          Click to add text
        </div>
      ) : (
        <div className="w-full h-full p-1 whitespace-pre-wrap">
          {wordTimings && wordTimings.length > 0 ? renderTextWithWordSpans(text) : text}
        </div>
      )}
    </div>
  );
}

export default EditableTextbox;
