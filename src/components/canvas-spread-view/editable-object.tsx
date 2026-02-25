// editable-object.tsx - Utility component for displaying objects in CanvasSpreadView
'use client';

import { useState, useCallback, useRef } from 'react';
import { BoxIcon, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpreadObject } from './types';
import { COLORS } from './constants';

interface EditableObjectProps {
  object: SpreadObject;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (rect?: DOMRect) => void;
  onUpdate?: (updates: Partial<SpreadObject>) => void;
  onDelete?: () => void;
}

// Z-Index mapping by object type (fallback if no explicit zIndex)
const DEFAULT_Z_INDEX: Record<SpreadObject['type'], number> = {
  background: 50,
  character: 125,
  prop: 175,
  foreground: 250,
  raw: 150,
  other: 150,
};

export function EditableObject({
  object,
  index,
  isSelected,
  isEditable,
  onSelect,
}: EditableObjectProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(!!object.media_url);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine z-index: explicit or default by type
  const zIndex = object.zIndex ?? DEFAULT_Z_INDEX[object.type];

  // Visibility state logic
  const isEditorVisible = object.editor_visible;
  const isPlayerVisible = object.player_visible;

  // Visual state based on visibility flags
  const showPlayerOnly = isEditorVisible && !isPlayerVisible; // 50% opacity + player icon
  const showEditorOnly = !isEditorVisible && isPlayerVisible; // Dashed border, no fill
  const showHidden = !isEditorVisible && !isPlayerVisible; // opacity 0, still clickable

  // Determine opacity
  const opacity = showHidden ? 0 : showPlayerOnly ? 0.5 : 1;

  // Determine if we should render image or placeholder
  const imageUrl = object.media_url;
  const showImage = imageUrl && !hasError;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (isEditable) {
        const rect = containerRef.current?.getBoundingClientRect();
        onSelect(rect);
      }
    },
    [isEditable, onSelect]
  );

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  // Container styles
  const containerStyle: React.CSSProperties = {
    left: `${object.geometry.x}%`,
    top: `${object.geometry.y}%`,
    width: `${object.geometry.w}%`,
    height: `${object.geometry.h}%`,
    zIndex,
    opacity,
    outlineColor: COLORS.HOVER_OUTLINE,
    ...(showEditorOnly && {
      border: '2px dashed rgba(0, 0, 0, 0.3)',
      backgroundColor: 'transparent',
    }),
  };

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={object.name || `Object ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute overflow-hidden',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1'
      )}
      style={containerStyle}
    >
      {showImage && !showEditorOnly ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <img
            key={imageUrl}
            src={imageUrl}
            alt={object.name}
            className="w-full h-full object-contain"
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </>
      ) : showEditorOnly ? (
        <EditorOnlyPlaceholder name={object.name} />
      ) : (
        <ObjectPlaceholder name={object.name} type={object.type} />
      )}

      {/* Visibility overlay - player-only icon */}
      {showPlayerOnly && (
        <div className="absolute top-1 right-1 p-1 bg-black/50 rounded">
          <Eye className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Hidden state indicator (when editor_visible=false, player_visible=true) */}
      {showEditorOnly && (
        <div className="absolute top-1 right-1 p-1 bg-black/50 rounded">
          <EyeOff className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  );
}

// === ObjectPlaceholder (inline) ===
interface ObjectPlaceholderProps {
  name: string;
  type: SpreadObject['type'];
}

function ObjectPlaceholder({ name, type }: ObjectPlaceholderProps) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 border-2 border-dashed"
      style={{
        backgroundColor: COLORS.PLACEHOLDER_BG,
        borderColor: COLORS.PLACEHOLDER_BORDER,
      }}
    >
      <BoxIcon className="h-6 w-6 text-muted-foreground" />
      <p
        className="text-xs text-center line-clamp-2"
        style={{ color: COLORS.PLACEHOLDER_TEXT }}
      >
        {name || 'Unnamed Object'}
      </p>
      <span
        className="text-[10px] uppercase tracking-wide"
        style={{ color: COLORS.PLACEHOLDER_TEXT }}
      >
        {type}
      </span>
    </div>
  );
}

// === EditorOnlyPlaceholder (for editor_visible=false, player_visible=true) ===
interface EditorOnlyPlaceholderProps {
  name: string;
}

function EditorOnlyPlaceholder({ name }: EditorOnlyPlaceholderProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
      <EyeOff className="h-5 w-5 text-muted-foreground opacity-40" />
      <p className="text-[10px] text-center text-muted-foreground opacity-60">
        {name}
      </p>
    </div>
  );
}

export default EditableObject;
