// spread-editor-panel.tsx - Main editor canvas for selected spread
'use client';

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { SelectionFrame } from './selection-frame';
import { PageItem } from './page-item';
import {
  buildImageContext,
  buildTextContext,
  buildTextToolbarContext,
  buildObjectContext,
} from './utils/context-builders';
import { applyDragDelta, applyResizeDelta, applyNudge } from './utils/geometry-utils';
import { getScaledDimensions } from './utils/coordinate-utils';
import { CANVAS, Z_INDEX } from './constants';
import type {
  BaseSpread,
  SpreadTextbox,
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
  ObjectToolbarContext,
  LayoutOption,
  Typography,
  Fill,
  Outline,
  SpreadItemActionUnion,
} from './types';
import { getFirstTextboxKey } from '../shared';

// === Props Interface ===
interface SpreadEditorPanelProps<TSpread extends BaseSpread> {
  // Data
  spread: TSpread;
  spreadIndex: number;  // Currently unused, reserved for future features (e.g., spread navigation)

  // View config
  zoomLevel: number;
  isEditable: boolean;

  // Render configuration
  renderItems: ItemType[];

  // Item render functions (optional - skip rendering if not provided)
  renderImageItem?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem?: (context: TextItemContext<TSpread>) => ReactNode;
  renderObjectItem?: (context: ObjectItemContext<TSpread>) => ReactNode;

  // Toolbar render functions (optional)
  renderImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderTextToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;
  renderObjectToolbar?: (context: ObjectToolbarContext<TSpread>) => ReactNode;

  // Callbacks
  onSpreadItemAction?: (params: Omit<SpreadItemActionUnion, 'spreadId'>) => void;

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
  renderObjectToolbar,
  onSpreadItemAction,
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

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!state.selectedElement) return;
      if (!canvasRef.current) return;

      const target = e.target as Element;
      // Check if click is inside canvas
      if (canvasRef.current.contains(target)) return;
      // Check if click is inside a toolbar or its children (portaled to body)
      if (target.closest?.('[data-toolbar]')) return;
      // Check if click is inside Radix UI portals (Select, Popover, Dialog, etc.)
      if (target.closest?.('[data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-popover-content], [role="listbox"], [role="dialog"]')) return;

      setState((prev) => ({
        ...prev,
        selectedElement: null,
        selectedGeometry: null,
      }));
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state.selectedElement]);

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
        const langKey = getFirstTextboxKey(item || {});
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
        const langKey = getFirstTextboxKey(tb);
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
    if (!onSpreadItemAction) return;

    switch (element.type) {
      case 'image': {
        const image = spread.images[element.index];
        if (!image?.id) return;
        onSpreadItemAction({
          itemType: 'image',
          action: 'update',
          itemId: image.id,
          data: { geometry },
        });
        break;
      }
      case 'textbox': {
        // Update geometry in textbox (need to preserve language structure)
        const tb = spread.textboxes[element.index];
        if (!tb?.id) return;
        const langKey = getFirstTextboxKey(tb);
        if (langKey) {
          const langContent = tb[langKey] as { text: string; geometry: Geometry; typography: Typography; fill?: Fill; outline?: Outline };
          onSpreadItemAction({
            itemType: 'text',
            action: 'update',
            itemId: tb.id,
            data: {
              [langKey]: { ...langContent, geometry },
            } as Partial<SpreadTextbox>,
          });
        }
        break;
      }
      case 'object': {
        const obj = spread.objects?.[element.index];
        if (!obj?.id) return;
        onSpreadItemAction({
          itemType: 'object',
          action: 'update',
          itemId: obj.id,
          data: { geometry },
        });
        break;
      }
    }
  }, [spread.images, spread.textboxes, spread.objects, onSpreadItemAction]);

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

    const newGeometry = applyResizeDelta(originalGeometry, handle, delta.x, delta.y);

    // Helper: parse aspect ratio string to numeric value
    const parseAspectRatio = (ratio: string | undefined): number | null => {
      if (!ratio || ratio === 'free') return null;
      const [w, h] = ratio.split(':').map(Number);
      if (!w || !h) return null;
      return w / h;
    };

    // Helper: apply aspect ratio lock to geometry
    const applyAspectLock = (geo: Geometry, aspect: number) => {
      if (handle === 'e' || handle === 'w') {
        geo.h = geo.w / aspect;
      } else if (handle === 'n' || handle === 's') {
        geo.w = geo.h * aspect;
      } else {
        if (Math.abs(delta.x) > Math.abs(delta.y)) {
          geo.h = geo.w / aspect;
        } else {
          geo.w = geo.h * aspect;
        }
      }

      const minSize = CANVAS.MIN_ELEMENT_SIZE;
      if (geo.w < minSize) {
        geo.w = minSize;
        geo.h = minSize / aspect;
      }
      if (geo.h < minSize) {
        geo.h = minSize;
        geo.w = minSize * aspect;
      }

      geo.w = Math.min(geo.w, 100 - geo.x);
      geo.h = Math.min(geo.h, 100 - geo.y);
    };

    // Aspect ratio lock for Image items (always locked to original ratio)
    if (selectedElement.type === 'image') {
      const originalAspect = originalGeometry.w / originalGeometry.h;
      applyAspectLock(newGeometry, originalAspect);
    }

    // Aspect ratio lock for Object items (when aspect_ratio is set)
    if (selectedElement.type === 'object') {
      const obj = spread.objects?.[selectedElement.index];
      const aspect = parseAspectRatio(obj?.aspect_ratio);
      if (aspect) {
        applyAspectLock(newGeometry, aspect);
      }
    }

    updateElementGeometry(selectedElement, newGeometry);

    // Update selectedGeometry for toolbar positioning
    setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
  }, [state, updateElementGeometry, spread.images, spread.objects]);

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

    // Handle ESC first - works for all selection types including page
    if (e.key === 'Escape') {
      e.preventDefault();
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
        handleElementSelect(null);
      }
      return;
    }

    // For geometry operations, need valid geometry (not for page type)
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
      case 'Delete':
      case 'Backspace':
        // Don't delete element if user is editing text
        if (canDeleteItem && !state.isTextboxEditing && !state.isImageEditing && onSpreadItemAction) {
          if (selectedElement.type === 'image') {
            const image = spread.images[selectedElement.index];
            if (image?.id) {
              onSpreadItemAction({
                itemType: 'image',
                action: 'delete',
                itemId: image.id,
                data: null,
              });
            }
          }
          if (selectedElement.type === 'textbox') {
            const textbox = spread.textboxes[selectedElement.index];
            if (textbox?.id) {
              onSpreadItemAction({
                itemType: 'text',
                action: 'delete',
                itemId: textbox.id,
                data: null,
              });
            }
          }
          if (selectedElement.type === 'object') {
            const obj = spread.objects?.[selectedElement.index];
            if (obj?.id) {
              onSpreadItemAction({
                itemType: 'object',
                action: 'delete',
                itemId: obj.id,
                data: null,
              });
            }
          }
          handleElementSelect(null);
        }
        break;
    }
  }, [state, isEditable, getSelectedGeometry, updateElementGeometry, handleElementSelect, canDeleteItem, onSpreadItemAction, spread.images, spread.textboxes, spread.objects]);

  // === Wrapper callback for page updates (used by PageItem) ===
  const handleUpdatePage = useCallback((pageIndex: number, updates: Partial<TSpread['pages'][number]>) => {
    if (!onSpreadItemAction) return;
    onSpreadItemAction({
      itemType: 'page',
      action: 'update',
      itemId: pageIndex,
      data: updates,
    });
  }, [onSpreadItemAction]);

  // Unified action handler for context builders
  const handleSpreadItemAction = useCallback((params: Omit<SpreadItemActionUnion, 'spreadId'>) => {
    onSpreadItemAction?.(params);
  }, [onSpreadItemAction]);

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
            onUpdatePage={(updates) => handleUpdatePage(pageIndex, updates)}
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

        {/* Images - skip if renderImageItem not provided */}
        {renderItems.includes('image') && renderImageItem && spread.images.map((image, index) => {
          const context = buildImageContext(
            image,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            handleSpreadItemAction,
            handleImageEditingChange
          );
          return <div key={image.id || index}>{renderImageItem(context)}</div>;
        })}

        {/* Textboxes - skip if renderTextItem not provided */}
        {renderItems.includes('text') && renderTextItem && spread.textboxes.map((textbox, index) => {
          const context = buildTextContext(
            textbox,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            handleSpreadItemAction,
            handleTextboxEditingChange
          );
          return <div key={textbox.id || index}>{renderTextItem(context)}</div>;
        })}

        {/* Objects */}
        {renderItems.includes('object') && spread.objects?.map((obj, index) => {
          if (!renderObjectItem) return null;
          const context = buildObjectContext(
            obj,
            index,
            spread,
            state.selectedElement,
            handleElementSelect,
            handleSpreadItemAction
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
            const context = buildImageContext(image, selectedElement.index, spread, selectedElement, handleElementSelect, handleSpreadItemAction);
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

            const context = buildTextToolbarContext(
              textbox,
              selectedElement.index,
              spread,
              selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              canvasRef,
              state.selectedGeometry
            );

            return renderTextToolbar(context);
          }

          if (selectedElement.type === 'object' && renderObjectToolbar) {
            const obj = spread.objects?.[selectedElement.index];
            if (!obj) return null;
            const context = buildObjectContext(obj, selectedElement.index, spread, selectedElement, handleElementSelect, handleSpreadItemAction);

            return renderObjectToolbar({
              ...context,
              selectedGeometry: state.selectedGeometry,
              canvasRef,
            });
          }

          return null;
        })()}
      </div>
    </div>
  );
}

export default SpreadEditorPanel;
