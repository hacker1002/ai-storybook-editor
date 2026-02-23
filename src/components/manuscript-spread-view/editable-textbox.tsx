// editable-textbox.tsx - Utility component for editable text in ManuscriptSpreadView
'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Geometry, Typography } from './types';
import { COLORS } from './constants';

interface EditableTextboxProps {
  text: string;
  geometry: Geometry;
  typography?: Typography;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (rect?: DOMRect) => void;
  onTextChange: (text: string) => void;
  onEditingChange: (isEditing: boolean) => void;
}

export function EditableTextbox({
  text,
  geometry,
  typography,
  index,
  isSelected,
  isEditable,
  onSelect,
  onTextChange,
  onEditingChange,
}: EditableTextboxProps) {
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
    if (isEditable && !isEditing) {
      const rect = e.currentTarget.getBoundingClientRect();
      onSelect(rect);
    }
  }, [isEditable, isEditing, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable && isSelected) {
      enterEditMode();
    }
  }, [isEditable, isSelected, enterEditMode]);

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

  return (
    <div
      {...(isEditable && {
        role: 'textbox',
        'aria-label': `Textbox ${index + 1}`,
        'aria-multiline': 'true',
      })}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute overflow-hidden',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
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
          {text}
        </div>
      )}
    </div>
  );
}

export default EditableTextbox;
