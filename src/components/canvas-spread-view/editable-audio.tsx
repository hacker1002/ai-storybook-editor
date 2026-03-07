// editable-audio.tsx - Utility component for displaying audio items in CanvasSpreadView
'use client';

import { useState, useCallback } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpreadAudio } from './types';
import { COLORS } from './constants';

interface EditableAudioProps {
  audio: SpreadAudio;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  isThumbnail?: boolean;
  onSelect: () => void;
}

export function EditableAudio({
  audio,
  index,
  isSelected,
  isEditable,
  isThumbnail = false,
  onSelect,
}: EditableAudioProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable) {
      onSelect();
    }
  }, [isEditable, onSelect]);

  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const showAudio = audio.media_url && !hasError;

  return (
    <div
      role="img"
      aria-label={audio.title || audio.name || `Audio ${index + 1}`}
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
        left: `${audio.geometry.x}%`,
        top: `${audio.geometry.y}%`,
        width: `${audio.geometry.w}%`,
        height: `${audio.geometry.h}%`,
        zIndex: audio['z-index'],
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 border-2 border-dashed"
        style={{
          backgroundColor: COLORS.PLACEHOLDER_BG,
          borderColor: COLORS.PLACEHOLDER_BORDER,
        }}
      >
        {isLoading && showAudio && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <Volume2 className="h-5 w-5 text-muted-foreground" />
        <p
          className={cn('text-center line-clamp-1 text-xs', !audio.name && 'italic')}
          style={{ color: COLORS.PLACEHOLDER_TEXT }}
        >
          {audio.name || audio.title || 'Audio'}
        </p>
        {showAudio && !isThumbnail && (
          <audio
            src={audio.media_url}
            controls={isSelected}
            className="w-full max-w-[90%] h-6"
            preload="metadata"
            onLoadedData={handleLoadedData}
            onError={handleError}
          />
        )}
      </div>
    </div>
  );
}

export default EditableAudio;
