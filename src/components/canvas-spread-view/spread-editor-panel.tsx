// spread-editor-panel.tsx - Main editor canvas for selected spread
'use client';

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { SelectionFrame } from './selection-frame';
import { PageItem } from './page-item';
import {
  buildImageContext,
  buildTextContext,
  buildObjectContext,
} from './utils/context-builders';
import { applyDragDelta, applyResizeDelta, applyNudge } from './utils/geometry-utils';
import { getScaledDimensions } from './utils/coordinate-utils';
import { CANVAS, Z_INDEX } from './constants';
import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadObject,
  ItemType,
  SelectedElement,
  ResizeHandle,
  Point,
  Geometry,
  ImageItemContext,
  TextItemContext,
  ObjectItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  PageToolbarContext,
  LayoutOption,
  Typography,
  Fill,
  Outline,
} from './types';

// === Props Interface ===
interface SpreadEditorPanelProps<TSpread extends BaseSpread> {
  // Data
  spread: TSpread;
  spreadIndex: number;

  // View config
  zoomLevel: number;
  isEditable: boolean;

  // Render configuration
  renderItems: ItemType[];

  // Item render functions
  renderImageItem: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem: (context: TextItemContext<TSpread>) => ReactNode;
  renderObjectItem?: (context: ObjectItemContext<TSpread>) => ReactNode;

  // Toolbar render functions (optional)
  renderImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderTextToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;

  // Callbacks
  onUpdateSpread: (updates: Partial<TSpread>) => void;
  onUpdateImage: (imageIndex: number, updates: Partial<SpreadImage>) => void;
  onUpdateTextbox: (textboxIndex: number, updates: Partial<SpreadTextbox>) => void;
  onUpdateObject?: (objectIndex: number, updates: Partial<SpreadObject>) => void;
  onUpdatePage?: (pageIndex: number, updates: Partial<TSpread['pages'][number]>) => void;
  onDeleteImage?: (imageIndex: number) => void;
  onDeleteTextbox?: (textboxIndex: number) => void;

  // Item-level feature flags
  canAddItem?: boolean;
  canDeleteItem?: boolean;
  canResizeItem?: boolean;
  canDragItem?: boolean;

  // Layout config
  availableLayouts?: LayoutOption[];
}

// === Local State Interface ===
interface EditorState {
  selectedElement: SelectedElement | null;
  selectedGeometry: Geometry | null;  // For toolbar positioning
  isTextboxEditing: boolean;
  isImageEditing: boolean;
  isDragging: boolean;
  isResizing: boolean;
  activeHandle: ResizeHandle | null;
  originalGeometry: Geometry | null;
}

// === Main Component ===
export function SpreadEditorPanel<TSpread extends BaseSpread>({
  spread,
  zoomLevel,
  isEditable,
  renderItems,
  renderImageItem,
  renderTextItem,
  renderObjectItem,
  renderImageToolbar,
  renderTextToolbar,
  renderPageToolbar,
  onUpdateImage,
  onUpdateTextbox,
  onUpdateObject,
  onUpdatePage,
  onDeleteImage,
  onDeleteTextbox,
  canDeleteItem = false,
  canResizeItem = true,
  canDragItem = true,
  availableLayouts = [],
}: SpreadEditorPanelProps<TSpread>) {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Local state
  const [state, setState] = useState<EditorState>({
    selectedElement: null,
    selectedGeometry: null,
    isTextboxEditing: false,
    isImageEditing: false,
    isDragging: false,
    isResizing: false,
    activeHandle: null,
    originalGeometry: null,
  });

  // Reset selection when switching to different spread
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      selectedElement: null,
      selectedGeometry: null,
      isTextboxEditing: false,
      isImageEditing: false,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, [spread.id]);

  // Scaled dimensions
  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(zoomLevel);

  // === Selection Handlers ===
  const handleElementSelect = useCallback((element: SelectedElement | null) => {
    let geometry: Geometry | null = null;

    if (element) {
      if (element.type === 'image') {
        geometry = spread.images[element.index]?.geometry ?? null;
      } else if (element.type === 'textbox') {
        const item = spread.textboxes[element.index];
        const langKey = Object.keys(item || {}).find((k) => k !== 'id' && k !== 'title');
        geometry = langKey ? (item[langKey] as { geometry: Geometry })?.geometry ?? null : null;
      } else if (element.type === 'object') {
        geometry = spread.objects?.[element.index]?.geometry ?? null;
      }
    }

    setState((prev) => ({
      ...prev,
      selectedElement: element,
      selectedGeometry: geometry,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, [spread]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      handleElementSelect(null);
    }
  }, [handleElementSelect]);

  // === Geometry Access ===
  const getSelectedGeometry = useCallback((): Geometry | null => {
    const { selectedElement } = state;
    if (!selectedElement) return null;

    switch (selectedElement.type) {
      case 'image':
        return spread.images[selectedElement.index]?.geometry ?? null;
      case 'textbox': {
        const tb = spread.textboxes[selectedElement.index];
        if (!tb) return null;
        // Get geometry from first language key
        const langKey = Object.keys(tb).find((k) => k !== 'id' && k !== 'title');
        return langKey ? (tb[langKey] as { geometry: Geometry })?.geometry ?? null : null;
      }
      case 'object':
        return spread.objects?.[selectedElement.index]?.geometry ?? null;
      default:
        return null;
    }
  }, [state, spread]);

  // === Geometry Update ===
  const updateElementGeometry = useCallback((element: SelectedElement, geometry: Geometry) => {
    switch (element.type) {
      case 'image':
        onUpdateImage(element.index, { geometry });
        break;
      case 'textbox': {
        // Update geometry in textbox (need to preserve language structure)
        const tb = spread.textboxes[element.index];
        if (!tb) return;
        const langKey = Object.keys(tb).find((k) => k !== 'id' && k !== 'title');
        if (langKey) {
          const langContent = tb[langKey] as { text: string; geometry: Geometry; typography: Typography; fill?: Fill; outline?: Outline };
          onUpdateTextbox(element.index, {
            [langKey]: { ...langContent, geometry },
          } as Partial<SpreadTextbox>);
        }
        break;
      }
      case 'object':
        onUpdateObject?.(element.index, { geometry });
        break;
    }
  }, [spread.textboxes, onUpdateImage, onUpdateTextbox, onUpdateObject]);

  // === Drag Handlers ===
  const handleDragStart = useCallback(() => {
    const geometry = getSelectedGeometry();
    setState((prev) => ({
      ...prev,
      isDragging: true,
      originalGeometry: geometry,
    }));
  }, [getSelectedGeometry]);

  const handleDrag = useCallback((delta: Point) => {
    const { selectedElement, originalGeometry } = state;
    if (!selectedElement || !originalGeometry) return;

    const newGeometry = applyDragDelta(originalGeometry, delta.x, delta.y);
    updateElementGeometry(selectedElement, newGeometry);

    // Update selectedGeometry for toolbar positioning
    setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
  }, [state, updateElementGeometry]);

  const handleDragEnd = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDragging: false,
      originalGeometry: null,
    }));
  }, []);

  // === Resize Handlers ===
  const handleResizeStart = useCallback((handle: ResizeHandle) => {
    const geometry = getSelectedGeometry();
    setState((prev) => ({
      ...prev,
      isResizing: true,
      activeHandle: handle,
      originalGeometry: geometry,
    }));
  }, [getSelectedGeometry]);

  const handleResize = useCallback((handle: ResizeHandle, delta: Point) => {
    const { selectedElement, originalGeometry } = state;
    if (!selectedElement || !originalGeometry) return;

    let newGeometry = applyResizeDelta(originalGeometry, handle, delta.x, delta.y);

    // Aspect ratio lock for Image items
    if (selectedElement.type === 'image') {
      const image = spread.images[selectedElement.index];
      if (image) {
        // Calculate aspect ratio from original geometry (matches actual image aspect ratio)
        const originalAspect = originalGeometry.w / originalGeometry.h;

        // Determine which dimension drives the resize
        if (handle === 'e' || handle === 'w') {
          // Horizontal edge - adjust height to maintain aspect
          newGeometry.h = newGeometry.w / originalAspect;
        } else if (handle === 'n' || handle === 's') {
          // Vertical edge - adjust width to maintain aspect
          newGeometry.w = newGeometry.h * originalAspect;
        } else {
          // Corner - use dominant delta
          if (Math.abs(delta.x) > Math.abs(delta.y)) {
            newGeometry.h = newGeometry.w / originalAspect;
          } else {
            newGeometry.w = newGeometry.h * originalAspect;
          }
        }

        // Re-apply MIN_SIZE after aspect ratio adjustment
        const minSize = CANVAS.MIN_ELEMENT_SIZE;
        if (newGeometry.w < minSize) {
          newGeometry.w = minSize;
          newGeometry.h = minSize / originalAspect;
        }
        if (newGeometry.h < minSize) {
          newGeometry.h = minSize;
          newGeometry.w = minSize * originalAspect;
        }

        // Ensure bounds (0-100%)
        newGeometry.w = Math.min(newGeometry.w, 100 - newGeometry.x);
        newGeometry.h = Math.min(newGeometry.h, 100 - newGeometry.y);
      }
    }

    updateElementGeometry(selectedElement, newGeometry);

    // Update selectedGeometry for toolbar positioning
    setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
  }, [state, updateElementGeometry, spread.images]);

  const handleResizeEnd = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, []);

  // === Editing Handlers ===
  const handleTextboxEditingChange = useCallback((isEditing: boolean) => {
    setState((prev) => ({ ...prev, isTextboxEditing: isEditing }));
  }, []);

  const handleImageEditingChange = useCallback((isEditing: boolean) => {
    setState((prev) => ({ ...prev, isImageEditing: isEditing }));
  }, []);

  // === Keyboard Handlers ===
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { selectedElement, isDragging, isResizing, originalGeometry } = state;
    if (!selectedElement || !isEditable) return;

    const geometry = getSelectedGeometry();
    if (!geometry) return;

    const step = e.shiftKey ? CANVAS.NUDGE_STEP_SHIFT : CANVAS.NUDGE_STEP;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        updateElementGeometry(selectedElement, applyNudge(geometry, 'up', step));
        break;
      case 'ArrowDown':
        e.preventDefault();
        updateElementGeometry(selectedElement, applyNudge(geometry, 'down', step));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        updateElementGeometry(selectedElement, applyNudge(geometry, 'left', step));
        break;
      case 'ArrowRight':
        e.preventDefault();
        updateElementGeometry(selectedElement, applyNudge(geometry, 'right', step));
        break;
      case 'Escape':
        e.preventDefault();
        // Cancel drag/resize and revert to original geometry
        if ((isDragging || isResizing) && originalGeometry) {
          updateElementGeometry(selectedElement, originalGeometry);
          setState((prev) => ({
            ...prev,
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            originalGeometry: null,
            selectedGeometry: originalGeometry,
          }));
        } else {
          // Just deselect if not dragging/resizing
          handleElementSelect(null);
        }
        break;
      case 'Delete':
      case 'Backspace':
        // Don't delete element if user is editing text
        if (canDeleteItem && !state.isTextboxEditing && !state.isImageEditing) {
          if (selectedElement.type === 'image') onDeleteImage?.(selectedElement.index);
          if (selectedElement.type === 'textbox') onDeleteTextbox?.(selectedElement.index);
          handleElementSelect(null);
        }
        break;
    }
  }, [state, isEditable, getSelectedGeometry, updateElementGeometry, handleElementSelect, canDeleteItem, onDeleteImage, onDeleteTextbox]);

  // === Render ===
  const selectedGeometry = getSelectedGeometry();
  const showHandles = canResizeItem && !state.isDragging;

  return (
    <div
      className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30"
      role="application"
      aria-label="Spread editor"
    >
      <div
        ref={canvasRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: 'transform',
        }}
        onClick={handleCanvasClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Page Backgrounds */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={spread.pages.length === 1 ? 'single' : pageIndex === 0 ? 'left' : 'right'}
            isSelected={state.selectedElement?.type === 'page' && state.selectedElement.index === pageIndex}
            onSelect={renderPageToolbar ? () => handleElementSelect({ type: 'page', index: pageIndex }) : undefined}
            onUpdatePage={(updates) => onUpdatePage?.(pageIndex, updates)}
            renderPageToolbar={renderPageToolbar}
            availableLayouts={availableLayouts}
          />
        ))}

        {/* Page Divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: '50%', zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Images */}
        {renderItems.includes('image') && spread.images.map((image, index) => {
          const context = buildImageContext(
            image,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            onUpdateImage,
            onDeleteImage,
            handleImageEditingChange
          );
          return <div key={image.id || index}>{renderImageItem(context)}</div>;
        })}

        {/* Textboxes */}
        {renderItems.includes('text') && spread.textboxes.map((textbox, index) => {
          const context = buildTextContext(
            textbox,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            onUpdateTextbox,
            onDeleteTextbox,
            'en_US',
            handleTextboxEditingChange
          );
          return <div key={textbox.id || index}>{renderTextItem(context)}</div>;
        })}

        {/* Objects */}
        {renderItems.includes('object') && spread.objects?.map((obj, index) => {
          if (!renderObjectItem || !onUpdateObject) return null;
          const context = buildObjectContext(
            obj,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            onUpdateObject
          );
          return <div key={obj.id || index}>{renderObjectItem(context)}</div>;
        })}

        {/* Selection Frame - frame border allows drag, center passes through for editing */}
        {state.selectedElement && selectedGeometry && isEditable && state.selectedElement.type !== 'page' && (
          <SelectionFrame
            geometry={selectedGeometry}
            zoomLevel={zoomLevel}
            showHandles={showHandles}
            activeHandle={state.activeHandle}
            canDrag={canDragItem}
            canResize={canResizeItem}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
          />
        )}

        {/* Toolbars (rendered by consumer) */}
        {state.selectedElement && isEditable && (() => {
          const { selectedElement } = state;

          if (selectedElement.type === 'image' && renderImageToolbar) {
            const image = spread.images[selectedElement.index];
            if (!image) return null;
            const context = buildImageContext(image, selectedElement.index, spread, selectedElement, handleElementSelect, onUpdateImage, onDeleteImage);
            return renderImageToolbar({
              ...context,
              selectedGeometry: state.selectedGeometry,
              canvasRef,
              onGenerateImage: () => {},
              onReplaceImage: () => {},
            });
          }

          if (selectedElement.type === 'textbox' && renderTextToolbar) {
            const textbox = spread.textboxes[selectedElement.index];
            if (!textbox) return null;
            const langKey = Object.keys(textbox).find((k) => k !== 'id' && k !== 'title') || 'en_US';
            const langContent = textbox[langKey] as { text: string; geometry: Geometry; typography: Typography; fill?: Fill; outline?: Outline };
            const context = buildTextContext(textbox, selectedElement.index, spread, selectedElement, handleElementSelect, onUpdateTextbox, onDeleteTextbox);

            return renderTextToolbar({
              ...context,
              selectedGeometry: state.selectedGeometry,
              canvasRef,
              onFormatText: (format: Partial<Typography>) => {
                onUpdateTextbox(selectedElement.index, {
                  [langKey]: { ...langContent, typography: { ...langContent?.typography, ...format } },
                } as Partial<SpreadTextbox>);
              },
              onUpdateBackground: (bg: Partial<Fill>) => {
                onUpdateTextbox(selectedElement.index, {
                  [langKey]: { ...langContent, fill: { ...(langContent?.fill || { color: '#ffffff', opacity: 0 }), ...bg } },
                } as Partial<SpreadTextbox>);
              },
              onUpdateOutline: (outlineUpdates: Partial<Outline>) => {
                onUpdateTextbox(selectedElement.index, {
                  [langKey]: { ...langContent, outline: { ...(langContent?.outline || { color: '#000000', width: 2, radius: 8, type: 'solid' }), ...outlineUpdates } },
                } as Partial<SpreadTextbox>);
              },
            });
          }

          return null;
        })()}
      </div>
    </div>
  );
}

export default SpreadEditorPanel;
