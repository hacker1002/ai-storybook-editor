// editable-image.tsx - Utility component for displaying images in ManuscriptSpreadView
'use client';

import { useState, useCallback } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpreadImage } from './types';
import { COLORS } from './constants';

interface EditableImageProps {
  image: SpreadImage;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: () => void;
}

export function EditableImage({
  image,
  index,
  isSelected,
  isEditable,
  onSelect,
}: EditableImageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Get image URL (prefer final, then selected illustration)
  const imageUrl = image.final_hires_media_url
    || image.illustrations?.find(i => i.is_selected)?.media_url
    || image.illustrations?.[0]?.media_url;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable) {
      onSelect();
    }
  }, [isEditable, onSelect]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  // Get display content for placeholder
  const displayContent = image.art_note || image.visual_description || 'No description';
  const showImage = imageUrl && !hasError;

  return (
    <div
      role="img"
      aria-label={displayContent || `Image ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && isEditable && onSelect()}
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
            alt={displayContent}
            className="w-full h-full object-contain"
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </>
      ) : (
        <ImagePlaceholder content={displayContent} />
      )}
    </div>
  );
}

// === ImagePlaceholder (inline) ===
function ImagePlaceholder({ content }: { content: string }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 border-2 border-dashed"
      style={{
        backgroundColor: COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
      }}
    >
      <ImageIcon className="h-6 w-6 text-muted-foreground" />
      <p
        className="text-xs text-center italic line-clamp-3"
        style={{ color: COLORS.PLACEHOLDER_TEXT }}
      >
        {content}
      </p>
    </div>
  );
}

export default EditableImage;
