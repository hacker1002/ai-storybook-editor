// editable-audio.tsx - Utility component for displaying audio items in CanvasSpreadView
'use client';

import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadAudio } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';

interface EditableAudioProps {
  audio: SpreadAudio;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: () => void;
}

export function EditableAudio({
  audio,
  index,
  zIndex,
  isSelected,
  isEditable,
  onSelect,
}: EditableAudioProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [_isLoading, setIsLoading] = useState(true);
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
        'absolute',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${audio.geometry.x}%`,
        top: `${audio.geometry.y}%`,
        zIndex,
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full border-2',
          isSelected ? 'border-solid' : 'border-dashed',
        )}
        style={{
          backgroundColor: COLORS.PLACEHOLDER_BG,
          borderColor: isSelected ? COLORS.SELECTION : COLORS.PLACEHOLDER_BORDER,
        }}
      >
        <Volume2 className="h-4 w-4 text-muted-foreground" />
      </div>
      {/* Hidden audio element for preload */}
      {showAudio && (
        <audio
          src={audio.media_url}
          className="hidden"
          preload="metadata"
          onLoadedData={handleLoadedData}
          onError={handleError}
        />
      )}
    </div>
  );
}

export default EditableAudio;
