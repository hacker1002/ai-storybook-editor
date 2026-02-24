// spread-thumbnail.tsx
'use client';

import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buildViewOnlyImageContext, buildViewOnlyTextContext } from './utils/context-builders';
import { THUMBNAIL } from './constants';
import type {
  BaseSpread,
  ItemType,
  ImageItemContext,
  TextItemContext,
} from './types';

interface SpreadThumbnailProps<TSpread extends BaseSpread> {
  // Data
  spread: TSpread;
  spreadIndex: number;

  // State
  isSelected: boolean;
  size: 'small' | 'medium';

  // Render configuration
  renderItems: ItemType[];
  renderImageItem: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem: (context: TextItemContext<TSpread>) => ReactNode;

  // Drag state
  isDragEnabled?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;

  // Callbacks
  onClick: () => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
}

export function SpreadThumbnail<TSpread extends BaseSpread>({
  spread,
  spreadIndex,
  isSelected,
  size,
  renderItems,
  renderImageItem,
  renderTextItem,
  isDragEnabled = false,
  isDragging = false,
  isDropTarget = false,
  onClick,
}: SpreadThumbnailProps<TSpread>) {
  // Scale factor
  const scale = size === 'small' ? THUMBNAIL.SMALL_SCALE : THUMBNAIL.MEDIUM_SCALE;

  // Page label
  const label = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-label={`Spread ${spreadIndex + 1}, ${label}`}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'flex-shrink-0 cursor-pointer transition-all scroll-snap-align-start',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        isDragging && 'opacity-50',
        isDropTarget && 'ring-2 ring-dashed ring-blue-400',
      )}
      draggable={isDragEnabled}
      aria-grabbed={isDragging}
    >
      {/* Thumbnail Container */}
      <div
        className={cn(
          'relative overflow-hidden rounded-md bg-white shadow-sm',
          'hover:shadow-md transition-shadow',
          isSelected && 'ring-2 ring-blue-500',
        )}
        style={{
          width: size === 'small' ? THUMBNAIL.SMALL_SIZE.width : 'auto',
          height: size === 'small' ? THUMBNAIL.SMALL_SIZE.height : 'auto',
          contain: 'layout style paint',
        }}
      >
        {/* Scaled Content */}
        <div
          className="relative"
          style={{
            width: 800,
            height: 600,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Page Background */}
          <div className="absolute inset-0 bg-gray-50" />

          {/* Page Divider */}
          {spread.pages.length > 1 && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-200" />
          )}

          {/* Images (view-only) */}
          {renderItems.includes('image') && spread.images.map((image, index) => {
            const context = buildViewOnlyImageContext(image, index, spread);
            return <div key={image.id || index}>{renderImageItem(context)}</div>;
          })}

          {/* Textboxes (view-only) */}
          {renderItems.includes('text') && spread.textboxes.map((textbox, index) => {
            const context = buildViewOnlyTextContext(textbox, index, spread);
            return <div key={textbox.id || index}>{renderTextItem(context)}</div>;
          })}
        </div>
      </div>

      {/* Label */}
      <p className="mt-1 text-xs text-center text-muted-foreground truncate">
        {label}
      </p>
    </div>
  );
}

export default SpreadThumbnail;
