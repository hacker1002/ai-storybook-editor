// editable-art-note.tsx - Inline-editable art note placeholder for dummy image items
"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/utils/utils";
import type { Geometry } from "@/types/spread-types";
import type { DummyTypography } from "@/types/dummy";
import { COLORS } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "EditableArtNote");

interface EditableArtNoteProps {
  artNote: string;
  geometry: Geometry;
  typography?: DummyTypography;

  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  /** Controlled edit mode — when provided, parent owns the editing state */
  isEditing?: boolean;

  onSelect: (rect?: DOMRect) => void;
  onArtNoteChange: (artNote: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export function EditableArtNote({
  artNote,
  geometry,
  typography,
  index,
  zIndex,
  isSelected,
  isEditable,
  isEditing: controlledIsEditing,
  onSelect,
  onArtNoteChange,
  onEditingChange,
}: EditableArtNoteProps) {
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledIsEditing !== undefined;
  const effectiveIsEditing = isControlled ? controlledIsEditing! : internalIsEditing;
  const prevEditingRef = useRef<boolean>(effectiveIsEditing);

  const typographyStyle = useMemo((): React.CSSProperties => ({
    fontSize: typography?.size ? `${typography.size}px` : undefined,
    color: typography?.color || undefined,
  }), [typography]);

  // Side-effect helpers

  const applyEnterEditModeSideEffects = useCallback(() => {
    requestAnimationFrame(() => {
      if (editableRef.current) {
        editableRef.current.innerText = artNote;
        editableRef.current.focus();
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
  }, [artNote]);

  const applyExitEditModeSideEffects = useCallback(
    (save: boolean) => {
      if (save && editableRef.current) {
        const newText = editableRef.current.innerText;
        if (newText !== artNote) {
          onArtNoteChange(newText);
        }
      }
    },
    [artNote, onArtNoteChange]
  );

  // Controlled transitions: parent flips isEditing → apply side effects
  useEffect(() => {
    if (!isControlled) return;
    const wasEditing = prevEditingRef.current;
    if (!wasEditing && controlledIsEditing === true) {
      log.debug("useEffect", "controlled enter edit", { index });
      applyEnterEditModeSideEffects();
    }
    if (wasEditing && controlledIsEditing === false) {
      log.debug("useEffect", "controlled exit edit", { index });
      applyExitEditModeSideEffects(true);
    }
    prevEditingRef.current = !!controlledIsEditing;
  }, [controlledIsEditing, isControlled, applyEnterEditModeSideEffects, applyExitEditModeSideEffects, index]);

  const enterEditMode = useCallback(() => {
    if (isControlled) {
      onEditingChange?.(true);
    } else {
      setInternalIsEditing(true);
      onEditingChange?.(true);
      applyEnterEditModeSideEffects();
    }
  }, [isControlled, onEditingChange, applyEnterEditModeSideEffects]);

  const exitEditMode = useCallback(
    (save: boolean) => {
      if (isControlled) {
        applyExitEditModeSideEffects(save);
        onEditingChange?.(false);
      } else {
        applyExitEditModeSideEffects(save);
        setInternalIsEditing(false);
        onEditingChange?.(false);
      }
    },
    [isControlled, applyExitEditModeSideEffects, onEditingChange]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!effectiveIsEditing) {
        log.info("handleClick", "art note clicked", { index });
        const rect = e.currentTarget.getBoundingClientRect();
        onSelect(rect);
      }
    },
    [effectiveIsEditing, onSelect, index]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEditable) {
        enterEditMode();
      }
    },
    [isEditable, enterEditMode]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSelected && !effectiveIsEditing && isEditable && e.key === "Enter") {
        e.preventDefault();
        enterEditMode();
      }
      if (effectiveIsEditing) {
        if (e.key === "Escape") {
          exitEditMode(false);
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          exitEditMode(true);
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.stopPropagation();
        }
      }
    },
    [isSelected, effectiveIsEditing, isEditable, enterEditMode, exitEditMode]
  );

  const handleBlur = useCallback(() => {
    if (effectiveIsEditing) {
      exitEditMode(true);
    }
  }, [effectiveIsEditing, exitEditMode]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const plainText = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(plainText));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  return (
    <div
      role="img"
      aria-label={artNote || `Art note ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "absolute flex flex-col items-center justify-center gap-2 p-2 cursor-pointer",
        "border-2 border-dashed",
        !isSelected && isHovered && "outline outline-1"
      )}
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
        zIndex,
        backgroundColor: COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
        outlineColor: isHovered ? COLORS.HOVER_OUTLINE : undefined,
        ...typographyStyle,
      }}
    >
      <ImageIcon className="h-6 w-6 text-muted-foreground shrink-0" aria-hidden />

      {effectiveIsEditing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onPaste={handlePaste}
          className="w-full min-h-0 outline-none px-2 py-1 text-center"
          style={{ backgroundColor: COLORS.EDIT_MODE_BG }}
          aria-multiline="true"
        />
      ) : (
        <p
          className="line-clamp-3 px-2 text-center italic text-xs"
          style={{ color: COLORS.PLACEHOLDER_TEXT }}
        >
          {artNote || "Click pencil to add art note"}
        </p>
      )}
    </div>
  );
}

export default EditableArtNote;
