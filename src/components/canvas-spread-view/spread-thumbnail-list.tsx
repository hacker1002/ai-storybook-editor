// spread-thumbnail-list.tsx
'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SpreadThumbnail } from './spread-thumbnail';
import { NewSpreadButton } from './new-spread-button';
import type {
  BaseSpread,
  ItemType,
  ThumbnailListLayout,
  ImageItemContext,
  TextItemContext,
} from './types';
import { COLUMNS } from './constants';

interface SpreadThumbnailListProps<TSpread extends BaseSpread> {
  // Data
  spreads: TSpread[];
  selectedId: string | null;

  // Layout
  layout: ThumbnailListLayout;
  columnsPerRow?: number;

  // Render configuration
  renderItems: ItemType[];
  renderImageItem: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem: (context: TextItemContext<TSpread>) => ReactNode;

  // Feature flags
  canAdd: boolean;
  canReorder: boolean;
  canDelete: boolean;

  // Callbacks
  onSpreadClick: (spreadId: string) => void;
  onReorderSpread?: (fromIndex: number, toIndex: number) => void;
  onAddSpread?: () => void;
  onDeleteSpread?: (spreadId: string) => void;
}

export function SpreadThumbnailList<TSpread extends BaseSpread>({
  spreads,
  selectedId,
  layout,
  columnsPerRow = COLUMNS.DEFAULT,
  renderItems,
  renderImageItem,
  renderTextItem,
  canAdd,
  canReorder,
  onSpreadClick,
  onReorderSpread,
  onAddSpread,
}: SpreadThumbnailListProps<TSpread>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;

    const selected = containerRef.current.querySelector(`[data-spread-id="${selectedId}"]`);
    selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedId]);

  // Drag-drop handlers
  const handleDragStart = (spreadId: string) => {
    if (!canReorder) return;
    setDraggedId(spreadId);
  };

  const handleDragOver = (spreadId: string) => {
    if (!canReorder || spreadId === draggedId) return;
    setDropTargetId(spreadId);
  };

  const handleDragEnd = () => {
    if (draggedId && dropTargetId && draggedId !== dropTargetId) {
      const fromIndex = spreads.findIndex((s) => s.id === draggedId);
      const toIndex = spreads.findIndex((s) => s.id === dropTargetId);
      onReorderSpread?.(fromIndex, toIndex);
    }
    setDraggedId(null);
    setDropTargetId(null);
  };

  const isHorizontal = layout === 'horizontal';
  const thumbnailSize = isHorizontal ? 'small' : 'medium';

  // Empty state
  if (spreads.length === 0) {
    return (
      <div
        className="flex items-center justify-center p-4"
        role="listbox"
        aria-label="Spread thumbnails"
      >
        {canAdd && <NewSpreadButton size="medium" onClick={onAddSpread!} />}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Spread thumbnails"
      aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
      className={cn(
        isHorizontal
          ? 'flex gap-2 overflow-x-auto p-2 scroll-snap-x scroll-snap-mandatory'
          : 'grid gap-2 p-2 overflow-y-auto',
      )}
      style={!isHorizontal ? { gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)` } : undefined}
    >
      {spreads.map((spread, index) => (
        <div key={spread.id} data-spread-id={spread.id}>
          <SpreadThumbnail
            spread={spread}
            spreadIndex={index}
            isSelected={spread.id === selectedId}
            size={thumbnailSize}
            renderItems={renderItems}
            renderImageItem={renderImageItem}
            renderTextItem={renderTextItem}
            isDragEnabled={canReorder}
            isDragging={spread.id === draggedId}
            isDropTarget={spread.id === dropTargetId}
            onClick={() => onSpreadClick(spread.id)}
            onDragStart={() => handleDragStart(spread.id)}
            onDragOver={() => handleDragOver(spread.id)}
            onDragEnd={handleDragEnd}
          />
        </div>
      ))}

      {canAdd && (
        <NewSpreadButton size={thumbnailSize} onClick={onAddSpread!} />
      )}
    </div>
  );
}

export default SpreadThumbnailList;
