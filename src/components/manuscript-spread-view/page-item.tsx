// page-item.tsx
'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type {
  BaseSpread,
  PageData,
  PageToolbarContext,
  LayoutOption,
  TextureOption,
} from './types';
import { Z_INDEX, AVAILABLE_TEXTURES } from './constants';

interface PageItemProps<TSpread extends BaseSpread> {
  // Data
  page: PageData;
  pageIndex: number;
  spread: TSpread;
  spreadId: string;

  // Position
  position: 'left' | 'right' | 'single';

  // Selection
  isSelected: boolean;
  onSelect?: () => void;

  // Callbacks
  onUpdatePage: (updates: Partial<PageData>) => void;

  // Toolbar render (optional)
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;

  // Layout config
  availableLayouts: LayoutOption[];
}

export function PageItem<TSpread extends BaseSpread>({
  page,
  pageIndex,
  spread,
  spreadId,
  position,
  isSelected,
  onSelect,
  onUpdatePage,
  renderPageToolbar,
  availableLayouts,
}: PageItemProps<TSpread>) {
  const isSelectable = !!renderPageToolbar;
  const isLayoutLocked = page.layout !== null;

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelectable && onSelect) {
      onSelect();
    }
  }, [isSelectable, onSelect]);

  // Build toolbar context
  const toolbarContext = useMemo((): PageToolbarContext<TSpread> => ({
    page,
    pageIndex,
    position,
    spread,
    spreadId,
    isSelected,
    onUpdateLayout: (layoutId: string) => {
      if (isLayoutLocked) {
        console.warn('Layout is locked and cannot be changed');
        return;
      }
      onUpdatePage({ layout: layoutId });
    },
    onUpdateColor: (color: string) => {
      onUpdatePage({
        background: { ...page.background, color },
      });
    },
    onUpdateTexture: (texture: TextureOption) => {
      onUpdatePage({
        background: { ...page.background, texture },
      });
    },
    availableLayouts: availableLayouts.filter((l) =>
      spread.pages.length === 1 ? l.type === 1 : l.type === 2
    ),
    availableTextures: [...AVAILABLE_TEXTURES],
    isLayoutLocked,
  }), [
    page,
    pageIndex,
    position,
    spread,
    spreadId,
    isSelected,
    isLayoutLocked,
    availableLayouts,
    onUpdatePage,
  ]);

  // Background style
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: page.background.color,
    backgroundImage: page.background.texture
      ? `url(/textures/${page.background.texture}.png)`
      : 'none',
    backgroundRepeat: 'repeat',
    backgroundSize: '256px 256px',
  };

  // Position style based on left/right/single
  const positionStyle: React.CSSProperties = useMemo(() => {
    switch (position) {
      case 'left':
        return { left: 0, top: 0, width: '50%', height: '100%' };
      case 'right':
        return { left: '50%', top: 0, width: '50%', height: '100%' };
      case 'single':
      default:
        return { left: 0, top: 0, width: '100%', height: '100%' };
    }
  }, [position]);

  return (
    <>
      {/* Page Background */}
      <div
        role={isSelectable ? 'button' : 'presentation'}
        aria-label={isSelectable ? `Page ${page.number}, layout ${page.layout || 'none'}` : undefined}
        aria-hidden={!isSelectable}
        tabIndex={isSelectable ? 0 : -1}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && isSelectable && onSelect?.()}
        className={cn(
          'absolute',
          isSelectable && 'cursor-pointer',
          isSelected && 'ring-2 ring-blue-500 ring-inset',
        )}
        style={{
          ...positionStyle,
          ...backgroundStyle,
          zIndex: Z_INDEX.PAGE_BACKGROUND,
          pointerEvents: isSelectable ? 'auto' : 'none',
        }}
        data-page-index={pageIndex}
        data-page-number={page.number}
      />

      {/* Toolbar (rendered by consumer) */}
      {isSelected && renderPageToolbar && renderPageToolbar(toolbarContext)}
    </>
  );
}

export default PageItem;
