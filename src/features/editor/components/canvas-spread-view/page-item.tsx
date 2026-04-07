// page-item.tsx
'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { cn } from '@/utils/utils';
import type {
  BaseSpread,
  PageData,
  PageToolbarContext,
  LayoutOption,
  TextureOption,
} from '@/types/canvas-types';
import { Z_INDEX } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'PageItem');

/** Check if any items on a specific page have actual content data.
 *  Layout can only be changed when this returns false (page has no filled items). */
function hasPageItemData(
  spread: BaseSpread,
  pageIndex: number,
): boolean {
  const pagesCount = spread.pages.length;

  // Determine if a geometry x-coordinate falls on this page's half
  const isOnPage = (x: number) => {
    if (pagesCount === 1) return true; // DPS: all items belong to the single page
    return pageIndex === 0 ? x < 50 : x >= 50;
  };

  // Image has data if it has any uploaded/generated content
  const imageHasData = (img: { media_url?: string; final_hires_media_url?: string; illustrations?: unknown[] }) =>
    !!img.media_url || !!img.final_hires_media_url || (img.illustrations?.length ?? 0) > 0;

  // Check if a textbox on this page has text content in any language
  const textboxOnPageHasData = (tb: Record<string, unknown>): boolean => {
    let isOnThisPage = false;
    let hasText = false;
    for (const val of Object.values(tb)) {
      if (typeof val !== 'object' || val === null) continue;
      const obj = val as Record<string, unknown>;
      if ('geometry' in obj && 'text' in obj) {
        const geo = obj.geometry as { x: number };
        if (isOnPage(geo.x)) isOnThisPage = true;
        if (typeof obj.text === 'string' && obj.text.trim() !== '') hasText = true;
      }
    }
    return isOnThisPage && hasText;
  };

  // Raw items (illustration phase)
  if ((spread.raw_images ?? []).some((img) => isOnPage(img.geometry.x) && imageHasData(img))) return true;
  if ((spread.raw_textboxes ?? []).some((tb) => textboxOnPageHasData(tb as unknown as Record<string, unknown>))) return true;

  // Playable items (retouch phase)
  if (spread.images.some((img) => isOnPage(img.geometry.x) && imageHasData(img))) return true;
  if (spread.textboxes.some((tb) => textboxOnPageHasData(tb as unknown as Record<string, unknown>))) return true;

  return false;
}

const AVAILABLE_TEXTURES = [
  "paper",
  "canvas",
  "linen",
  "watercolor",
  null,
] as const;

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
  // Layout is locked when items on this page already have content data
  const isLayoutLocked = hasPageItemData(spread, pageIndex);

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
        log.warn('onUpdateLayout', 'layout is locked', { pageIndex, layoutId });
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
