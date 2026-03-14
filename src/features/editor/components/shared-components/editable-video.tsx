// editable-video.tsx - Utility component for displaying videos in CanvasSpreadView
'use client';

import { useState, useCallback } from 'react';
import { Video, Loader2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadVideo } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';

interface EditableVideoProps {
  video: SpreadVideo;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  isThumbnail?: boolean;
  onSelect: () => void;
}

export function EditableVideo({
  video,
  index,
  isSelected,
  isEditable,
  isThumbnail = false,
  onSelect,
}: EditableVideoProps) {
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

  const showVideo = video.media_url && !hasError;

  return (
    <div
      role="img"
      aria-label={video.title || video.name || `Video ${index + 1}`}
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
        left: `${video.geometry.x}%`,
        top: `${video.geometry.y}%`,
        width: `${video.geometry.w}%`,
        height: `${video.geometry.h}%`,
        zIndex: video['z-index'],
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      {showVideo ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {isThumbnail ? (
            // Show first frame as poster in thumbnail mode
            <video
              src={video.media_url}
              className="w-full h-full object-contain"
              preload="metadata"
              onLoadedData={handleLoadedData}
              onError={handleError}
            />
          ) : (
            <video
              src={video.media_url}
              className="w-full h-full object-contain"
              preload="metadata"
              onLoadedData={handleLoadedData}
              onError={handleError}
            />
          )}
        </>
      ) : (
        <VideoPlaceholder name={video.name || video.title || ''} />
      )}
    </div>
  );
}

interface VideoPlaceholderProps {
  name: string;
}

function VideoPlaceholder({ name }: VideoPlaceholderProps) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 border-2 border-dashed"
      style={{
        backgroundColor: COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
      }}
    >
      <Video className="h-6 w-6 text-muted-foreground" />
      <p
        className={cn('text-center line-clamp-2 text-xs', !name && 'italic')}
        style={{ color: COLORS.PLACEHOLDER_TEXT }}
      >
        {name || 'No video'}
      </p>
    </div>
  );
}

export default EditableVideo;
