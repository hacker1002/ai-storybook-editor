// spread-thumbnail-list.tsx
'use client';

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SpreadThumbnail } from './spread-thumbnail';
import { NewSpreadButton, type SpreadType } from './new-spread-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

  // Render configuration (optional - skip rendering if not provided)
  renderItems: ItemType[];
  renderImageItem?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem?: (context: TextItemContext<TSpread>) => ReactNode;

  // Feature flags
  canAdd: boolean;
  canReorder: boolean;
  canDelete: boolean;

  // Callbacks
  onSpreadClick: (spreadId: string) => void;
  onSpreadDoubleClick?: (spreadId: string) => void;
  onSpreadReorder?: (fromIndex: number, toIndex: number) => void;
  onSpreadAdd?: (type: SpreadType) => void;
  onDeleteSpread?: (spreadId: string) => void;
  checkSpreadHasContent?: (spread: TSpread) => boolean;
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
  canDelete,
  onSpreadClick,
  onSpreadDoubleClick,
  onSpreadReorder,
  onSpreadAdd,
  onDeleteSpread,
  checkSpreadHasContent,
}: SpreadThumbnailListProps<TSpread>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TSpread | null>(null);

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;

    const selected = containerRef.current.querySelector(`[data-spread-id="${selectedId}"]`);
    selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedId]);

  // Helper: Check if spread has content
  const hasDefaultContent = useCallback((spread: TSpread) => {
    return (
      spread.images.length > 0 ||
      spread.textboxes.length > 0 ||
      (spread.objects?.length ?? 0) > 0
    );
  }, []);

  // Delete handler with confirmation
  const handleDelete = useCallback((spread: TSpread) => {
    const hasContent = checkSpreadHasContent?.(spread) ?? hasDefaultContent(spread);

    if (hasContent) {
      setConfirmDelete(spread);
    } else {
      onDeleteSpread?.(spread.id);
    }
  }, [checkSpreadHasContent, hasDefaultContent, onDeleteSpread]);

  // Confirm delete handler
  const confirmDeleteHandler = useCallback(() => {
    if (confirmDelete) {
      onDeleteSpread?.(confirmDelete.id);
      setConfirmDelete(null);
    }
  }, [confirmDelete, onDeleteSpread]);

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
      onSpreadReorder?.(fromIndex, toIndex);
    }
    setDraggedId(null);
    setDropTargetId(null);
  };

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedId) return;

    const currentIndex = spreads.findIndex(s => s.id === selectedId);
    if (currentIndex === -1) return;

    const scrollIntoView = (index: number) => {
      if (!containerRef.current) return;
      const target = containerRef.current.querySelector(`[data-spread-id="${spreads[index].id}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          onSpreadClick(spreads[currentIndex - 1].id);
          scrollIntoView(currentIndex - 1);
        }
        break;

      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < spreads.length - 1) {
          onSpreadClick(spreads[currentIndex + 1].id);
          scrollIntoView(currentIndex + 1);
        }
        break;

      case 'Home':
        event.preventDefault();
        onSpreadClick(spreads[0].id);
        scrollIntoView(0);
        break;

      case 'End':
        event.preventDefault();
        onSpreadClick(spreads[spreads.length - 1].id);
        scrollIntoView(spreads.length - 1);
        break;

      case 'Delete':
        if (canDelete) {
          const selectedSpread = spreads[currentIndex];
          handleDelete(selectedSpread);
        }
        break;

      case 'Enter':
        if (layout === 'grid') {
          onSpreadDoubleClick?.(selectedId);
        }
        break;
    }
  }, [selectedId, spreads, canDelete, layout, onSpreadClick, onSpreadDoubleClick, handleDelete]);

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
        {canAdd && onSpreadAdd && <NewSpreadButton size="medium" onAdd={onSpreadAdd} />}
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        role="listbox"
        tabIndex={0}
        aria-label="Spread thumbnails"
        aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
        onKeyDown={handleKeyDown}
        className={cn(
          isHorizontal
            ? 'flex gap-2 overflow-x-auto p-2 scroll-snap-x scroll-snap-mandatory'
            : 'grid gap-4 p-4 overflow-y-auto items-start',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset',
        )}
        style={!isHorizontal ? {
          gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
        } : undefined}
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
              onDoubleClick={() => onSpreadDoubleClick?.(spread.id)}
              onDelete={() => handleDelete(spread)}
              canDelete={canDelete}
              isLastSpread={spreads.length === 1}
              onDragStart={() => handleDragStart(spread.id)}
              onDragOver={() => handleDragOver(spread.id)}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}

        {canAdd && onSpreadAdd && (
          <NewSpreadButton size={thumbnailSize} onAdd={onSpreadAdd} />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete spread?</AlertDialogTitle>
            <AlertDialogDescription>
              This spread has content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteHandler} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default SpreadThumbnailList;
