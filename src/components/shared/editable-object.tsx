// editable-object.tsx - Shared utility component for displaying objects
'use client';

import { useState, useCallback, useRef } from 'react';
import { BoxIcon, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpreadObject } from './types';
import { COLORS } from './constants';

// Border styles for remix mode
const REMIX_BORDER = {
  IDLE: '1px dashed #9E9E9E',
  HOVER: '1px solid #757575',
  SELECTED: '2px solid #2196F3',
};

interface EditableObjectProps {
  object: SpreadObject;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (rect?: DOMRect) => void;
  onUpdate?: (updates: Partial<SpreadObject>) => void;
  onDelete?: () => void;
  /** Remix mode: object is swappable (shows border, clickable) */
  isSwappable?: boolean;
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
  isSwappable,
}: EditableObjectProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(!!object.media_url);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Remix mode: isSwappable defined means we're in remix mode
  const isRemixMode = isSwappable !== undefined;

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

  // Clickable in remix mode only if swappable, otherwise use isEditable
  const isClickable = isRemixMode ? isSwappable : isEditable;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (isClickable) {
        const rect = containerRef.current?.getBoundingClientRect();
        onSelect(rect);
      }
    },
    [isClickable, onSelect]
  );

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  // Determine border for remix mode
  const getRemixBorder = (): string | undefined => {
    if (!isRemixMode) return undefined;
    if (isSelected) return REMIX_BORDER.SELECTED;
    if (isSwappable && isHovered) return REMIX_BORDER.HOVER;
    if (isSwappable) return REMIX_BORDER.IDLE;
    return 'none';
  };

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
    // Remix mode styling
    ...(isRemixMode && {
      border: getRemixBorder(),
      cursor: isSwappable ? 'pointer' : 'default',
      pointerEvents: isSwappable ? 'auto' : 'none',
      transition: 'border 0.15s ease',
    }),
  };

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={object.name || `Object ${index + 1}`}
      tabIndex={isClickable ? 0 : -1}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute overflow-hidden',
        isClickable && 'cursor-pointer',
        // Hover outline only in non-remix mode
        !isRemixMode && !isSelected && isHovered && 'outline-dashed outline-1'
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
