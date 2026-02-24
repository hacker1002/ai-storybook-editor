// canvas-spread-view.tsx - Root component composing all child components
'use client';

import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { SpreadViewHeader } from './spread-view-header';
import { SpreadEditorPanel } from './spread-editor-panel';
import { SpreadThumbnailList } from './spread-thumbnail-list';
import { ZOOM, COLUMNS } from './constants';
import type { ViewMode } from './types';

const STORAGE_KEY = 'spread-view-prefs';

interface ViewPreferences {
  viewMode: ViewMode;
  zoomLevel: number;
  columnsPerRow: number;
}

function loadViewPreferences(): Partial<ViewPreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveViewPreferences(prefs: ViewPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail if localStorage unavailable
  }
}

import type {
  BaseSpread,
  ItemType,
  SpreadImage,
  SpreadTextbox,
  SpreadObject,
  ImageItemContext,
  TextItemContext,
  ObjectItemContext,
  AnimationItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  PageToolbarContext,
  LayoutOption,
} from './types';

// === Props Interface ===
interface CanvasSpreadViewProps<TSpread extends BaseSpread> {
  // Data
  spreads: TSpread[];

  // Render configuration
  renderItems: ItemType[];

  // Item render functions
  renderImageItem: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem: (context: TextItemContext<TSpread>) => ReactNode;
  renderObjectItem?: (context: ObjectItemContext<TSpread>) => ReactNode;
  renderAnimationItem?: (context: AnimationItemContext<TSpread>) => ReactNode;

  // Toolbar render functions (optional)
  renderImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderTextToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;

  // Spread-level callbacks
  onSpreadSelect?: (spreadId: string) => void;
  onSpreadReorder?: (fromIndex: number, toIndex: number) => void;
  onSpreadAdd?: () => void;
  onSpreadDelete?: (spreadId: string) => void;

  // Item-level callbacks
  onUpdateSpread?: (spreadId: string, updates: Partial<TSpread>) => void;
  onUpdateImage?: (spreadId: string, imageIndex: number, updates: Partial<SpreadImage>) => void;
  onUpdateTextbox?: (spreadId: string, textboxIndex: number, updates: Partial<SpreadTextbox>) => void;
  onUpdateObject?: (spreadId: string, objectIndex: number, updates: Partial<SpreadObject>) => void;
  onUpdatePage?: (spreadId: string, pageIndex: number, updates: Partial<TSpread['pages'][number]>) => void;
  onDeleteImage?: (spreadId: string, imageIndex: number) => void;
  onDeleteTextbox?: (spreadId: string, textboxIndex: number) => void;

  // Feature flags
  isEditable?: boolean;
  canAddSpread?: boolean;
  canReorderSpread?: boolean;
  canDeleteSpread?: boolean;
  canAddItem?: boolean;
  canDeleteItem?: boolean;
  canResizeItem?: boolean;
  canDragItem?: boolean;

  // Layout config
  availableLayouts?: LayoutOption[];

  // Initial state (optional)
  initialSelectedId?: string;
  initialViewMode?: ViewMode;
}

// === Main Component ===
export function CanvasSpreadView<TSpread extends BaseSpread>({
  spreads,
  renderItems,
  renderImageItem,
  renderTextItem,
  renderObjectItem,
  renderImageToolbar,
  renderTextToolbar,
  renderPageToolbar,
  onSpreadSelect,
  onSpreadReorder,
  onSpreadAdd,
  onSpreadDelete,
  onUpdateSpread,
  onUpdateImage,
  onUpdateTextbox,
  onUpdateObject,
  onUpdatePage,
  onDeleteImage,
  onDeleteTextbox,
  isEditable = true,
  canAddSpread = false,
  canReorderSpread = false,
  canDeleteSpread = false,
  canAddItem = false,
  canDeleteItem = false,
  canResizeItem = true,
  canDragItem = true,
  availableLayouts = [],
  initialSelectedId,
  initialViewMode = 'edit',
}: CanvasSpreadViewProps<TSpread>) {
  // === Local View State (with localStorage persistence) ===
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const prefs = loadViewPreferences();
    return prefs.viewMode ?? initialViewMode;
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? spreads[0]?.id ?? null
  );
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const prefs = loadViewPreferences();
    return prefs.zoomLevel ?? ZOOM.DEFAULT;
  });
  const [columnsPerRow, setColumnsPerRow] = useState<number>(() => {
    const prefs = loadViewPreferences();
    return prefs.columnsPerRow ?? COLUMNS.DEFAULT;
  });

  // Persist view preferences to localStorage
  useEffect(() => {
    saveViewPreferences({ viewMode, zoomLevel, columnsPerRow });
  }, [viewMode, zoomLevel, columnsPerRow]);

  // === Derived State ===
  const selectedSpread = useMemo(
    () => spreads.find((s) => s.id === selectedId) ?? null,
    [spreads, selectedId]
  );

  const selectedIndex = useMemo(
    () => spreads.findIndex((s) => s.id === selectedId),
    [spreads, selectedId]
  );

  // === Global Keyboard Shortcuts ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          // Toggle view mode
          setViewMode((prev) => (prev === 'edit' ? 'grid' : 'edit'));
          break;
        case 'arrowleft':
          // Navigate to previous spread
          if (selectedIndex > 0) {
            const prevSpread = spreads[selectedIndex - 1];
            setSelectedId(prevSpread.id);
            onSpreadSelect?.(prevSpread.id);
          }
          break;
        case 'arrowright':
          // Navigate to next spread
          if (selectedIndex < spreads.length - 1) {
            const nextSpread = spreads[selectedIndex + 1];
            setSelectedId(nextSpread.id);
            onSpreadSelect?.(nextSpread.id);
          }
          break;
        case 'home':
          // Jump to first spread
          if (spreads.length > 0) {
            setSelectedId(spreads[0].id);
            onSpreadSelect?.(spreads[0].id);
          }
          break;
        case 'end':
          // Jump to last spread
          if (spreads.length > 0) {
            const lastSpread = spreads[spreads.length - 1];
            setSelectedId(lastSpread.id);
            onSpreadSelect?.(lastSpread.id);
          }
          break;
        case '+':
        case '=':
          // Zoom in / increase columns
          if (viewMode === 'edit') {
            setZoomLevel((prev) => Math.min(prev + ZOOM.STEP, ZOOM.MAX));
          } else {
            setColumnsPerRow((prev) => Math.min(prev + 1, COLUMNS.MAX));
          }
          break;
        case '-':
          // Zoom out / decrease columns
          if (viewMode === 'edit') {
            setZoomLevel((prev) => Math.max(prev - ZOOM.STEP, ZOOM.MIN));
          } else {
            setColumnsPerRow((prev) => Math.max(prev - 1, COLUMNS.MIN));
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, selectedIndex, spreads, onSpreadSelect]);

  // === Handlers ===
  const handleViewModeToggle = useCallback(() => {
    setViewMode((prev) => (prev === 'edit' ? 'grid' : 'edit'));
  }, []);

  const handleZoomChange = useCallback((level: number) => {
    setZoomLevel(level);
  }, []);

  const handleColumnsChange = useCallback((columns: number) => {
    setColumnsPerRow(columns);
  }, []);

  const handleSpreadClick = useCallback((spreadId: string) => {
    setSelectedId(spreadId);
    onSpreadSelect?.(spreadId);
    // Switch to edit mode when clicking thumbnail in grid mode
    if (viewMode === 'grid') {
      setViewMode('edit');
    }
  }, [viewMode, onSpreadSelect]);

  // Wrap callbacks to include spreadId
  const handleUpdateSpread = useCallback((updates: Partial<TSpread>) => {
    if (selectedId) onUpdateSpread?.(selectedId, updates);
  }, [selectedId, onUpdateSpread]);

  const handleUpdateImage = useCallback((imageIndex: number, updates: Partial<SpreadImage>) => {
    if (selectedId) onUpdateImage?.(selectedId, imageIndex, updates);
  }, [selectedId, onUpdateImage]);

  const handleUpdateTextbox = useCallback((textboxIndex: number, updates: Partial<SpreadTextbox>) => {
    if (selectedId) onUpdateTextbox?.(selectedId, textboxIndex, updates);
  }, [selectedId, onUpdateTextbox]);

  const handleUpdateObject = useCallback((objectIndex: number, updates: Partial<SpreadObject>) => {
    if (selectedId) onUpdateObject?.(selectedId, objectIndex, updates);
  }, [selectedId, onUpdateObject]);

  const handleUpdatePage = useCallback((pageIndex: number, updates: Partial<TSpread['pages'][number]>) => {
    if (selectedId) onUpdatePage?.(selectedId, pageIndex, updates);
  }, [selectedId, onUpdatePage]);

  const handleDeleteImage = useCallback((imageIndex: number) => {
    if (selectedId) onDeleteImage?.(selectedId, imageIndex);
  }, [selectedId, onDeleteImage]);

  const handleDeleteTextbox = useCallback((textboxIndex: number) => {
    if (selectedId) onDeleteTextbox?.(selectedId, textboxIndex);
  }, [selectedId, onDeleteTextbox]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <SpreadViewHeader
        viewMode={viewMode}
        zoomLevel={zoomLevel}
        columnsPerRow={columnsPerRow}
        onViewModeToggle={handleViewModeToggle}
        onZoomChange={handleZoomChange}
        onColumnsChange={handleColumnsChange}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {viewMode === 'edit' ? (
          <>
            {/* Edit Mode: Editor Panel */}
            {selectedSpread && (
              <SpreadEditorPanel
                spread={selectedSpread}
                spreadIndex={selectedIndex}
                zoomLevel={zoomLevel}
                isEditable={isEditable}
                renderItems={renderItems}
                renderImageItem={renderImageItem}
                renderTextItem={renderTextItem}
                renderObjectItem={renderObjectItem}
                renderImageToolbar={renderImageToolbar}
                renderTextToolbar={renderTextToolbar}
                renderPageToolbar={renderPageToolbar}
                onUpdateSpread={handleUpdateSpread}
                onUpdateImage={handleUpdateImage}
                onUpdateTextbox={handleUpdateTextbox}
                onUpdateObject={handleUpdateObject}
                onUpdatePage={handleUpdatePage}
                onDeleteImage={handleDeleteImage}
                onDeleteTextbox={handleDeleteTextbox}
                canAddItem={canAddItem}
                canDeleteItem={canDeleteItem}
                canResizeItem={canResizeItem}
                canDragItem={canDragItem}
                availableLayouts={availableLayouts}
              />
            )}

            {/* Edit Mode: Thumbnail Filmstrip */}
            <div className="border-t">
              <SpreadThumbnailList
                spreads={spreads}
                selectedId={selectedId}
                layout="horizontal"
                renderItems={renderItems}
                renderImageItem={renderImageItem}
                renderTextItem={renderTextItem}
                canAdd={canAddSpread}
                canReorder={canReorderSpread}
                canDelete={canDeleteSpread}
                onSpreadClick={handleSpreadClick}
                onReorderSpread={onSpreadReorder}
                onAddSpread={onSpreadAdd}
                onDeleteSpread={onSpreadDelete}
              />
            </div>
          </>
        ) : (
          /* Grid Mode: Thumbnail Grid */
          <SpreadThumbnailList
            spreads={spreads}
            selectedId={selectedId}
            layout="grid"
            columnsPerRow={columnsPerRow}
            renderItems={renderItems}
            renderImageItem={renderImageItem}
            renderTextItem={renderTextItem}
            canAdd={canAddSpread}
            canReorder={canReorderSpread}
            canDelete={canDeleteSpread}
            onSpreadClick={handleSpreadClick}
            onReorderSpread={onSpreadReorder}
            onAddSpread={onSpreadAdd}
            onDeleteSpread={onSpreadDelete}
          />
        )}
      </div>
    </div>
  );
}

export default CanvasSpreadView;
