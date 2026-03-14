// editable-image.tsx - Utility component for displaying images in CanvasSpreadView
'use client';

import { useState, useCallback, useRef } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadImage } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditableImage');

interface ArtNoteTypography {
  size?: number;
  color?: string;
}

interface EditableImageProps {
  image: SpreadImage;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (rect?: DOMRect) => void;
  onArtNoteChange?: (artNote: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  artNoteTypography?: ArtNoteTypography;
}

export function EditableImage({
  image,
  index,
  isSelected,
  isEditable,
  onSelect,
  onArtNoteChange,
  onEditingChange,
  artNoteTypography,
}: EditableImageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);

  // Image URL priority: final_hires > illustrations[selected] > illustrations[0] > media_url (sketch)
  const imageUrl = image.final_hires_media_url
    || image.illustrations?.find(i => i.is_selected)?.media_url
    || image.illustrations?.[0]?.media_url
    || image.media_url;

  // Get display content for placeholder
  const artNoteText = image.art_note || image.visual_description || '';
  const showImage = imageUrl && !hasError;
  const canEditArtNote = isEditable && !showImage && onArtNoteChange;

  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    onEditingChange?.(true);
    requestAnimationFrame(() => {
      if (editableRef.current) {
        editableRef.current.innerText = artNoteText;
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
  }, [artNoteText, onEditingChange]);

  const exitEditMode = useCallback((save: boolean) => {
    if (save && editableRef.current && onArtNoteChange) {
      const newText = editableRef.current.innerText;
      if (newText !== artNoteText) {
        onArtNoteChange(newText);
      }
    }
    setIsEditing(false);
    onEditingChange?.(false);
  }, [artNoteText, onArtNoteChange, onEditingChange]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isEditable && !isEditing) {
      log.info('handleClick', 'image clicked', { imageId: image.id, index });
      const rect = e.currentTarget.getBoundingClientRect();
      onSelect(rect);
    }
  }, [isEditable, isEditing, onSelect, image.id, index]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canEditArtNote && isSelected) {
      enterEditMode();
    }
  }, [canEditArtNote, isSelected, enterEditMode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isSelected && !isEditing && canEditArtNote && e.key === 'Enter') {
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
  }, [isSelected, isEditing, canEditArtNote, enterEditMode, exitEditMode]);

  const handleBlur = useCallback(() => {
    if (isEditing) {
      exitEditMode(true);
    }
  }, [isEditing, exitEditMode]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  return (
    <div
      role="img"
      aria-label={artNoteText || `Image ${index + 1}`}
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
        left: `${image.geometry.x}%`,
        top: `${image.geometry.y}%`,
        width: `${image.geometry.w}%`,
        height: `${image.geometry.h}%`,
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      {showImage ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <img
            key={imageUrl}
            src={imageUrl}
            alt={artNoteText}
            className="w-full h-full object-contain"
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </>
      ) : (
        <ImagePlaceholder
          content={artNoteText}
          isEditing={isEditing}
          canEdit={!!canEditArtNote}
          editableRef={editableRef}
          onBlur={handleBlur}
          typography={artNoteTypography}
        />
      )}
    </div>
  );
}

// === ImagePlaceholder (inline) ===
interface ImagePlaceholderProps {
  content: string;
  isEditing: boolean;
  canEdit: boolean;
  editableRef: React.RefObject<HTMLDivElement | null>;
  onBlur: () => void;
  typography?: ArtNoteTypography;
}

function ImagePlaceholder({ content, isEditing, canEdit, editableRef, onBlur, typography }: ImagePlaceholderProps) {
  const textStyle: React.CSSProperties = {
    color: typography?.color || COLORS.PLACEHOLDER_TEXT,
    fontSize: typography?.size ? `${typography.size}px` : undefined,
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 border-2 border-dashed"
      style={{
        backgroundColor: isEditing ? COLORS.EDIT_MODE_BG : COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
      }}
    >
      <ImageIcon className="h-6 w-6 text-muted-foreground" />
      {isEditing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={onBlur}
          className="text-center outline-none w-full max-h-20 overflow-auto"
          style={textStyle}
        />
      ) : (
        <p
          className={cn(
            'text-center line-clamp-3',
            canEdit && 'cursor-text',
            !content && 'italic',
            !typography?.size && 'text-xs',
          )}
          style={textStyle}
        >
          {content || 'Double-click to add art note'}
        </p>
      )}
    </div>
  );
}

export default EditableImage;
