// animation-editor-canvas.tsx - Main canvas for animation editor mode
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { EditableTextbox, EditableObject } from '../shared';
import { useToolbarPosition } from '../canvas-spread-view/hooks/use-toolbar-position';
import { PageItem } from '../canvas-spread-view/page-item';
import { Z_INDEX } from '../canvas-spread-view/constants';
import { getScaledDimensions } from '../canvas-spread-view/utils/coordinate-utils';
import { AddAnimationToolbar } from './add-animation-toolbar';
import { SelectionOverlay } from './selection-overlay';
import type { PlayableSpread, ItemType, AnimationMediaType, AddAnimationParams } from './types';
import type { Geometry, Typography, Fill, Outline } from '../shared/types';

const TEXTBOX_Z_INDEX_BASE = 300;

interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  language: string;
  zoomLevel?: number;
  onAddAnimation: (params: AddAnimationParams) => void;
}

// Helper to find language key in textbox
function getTextboxLanguageKey(textbox: Record<string, unknown>, preferredLang: string): string | null {
  if (textbox[preferredLang] && typeof textbox[preferredLang] === 'object') {
    return preferredLang;
  }
  // Fallback: find first language key (not 'id' or 'title')
  const langKey = Object.keys(textbox).find(
    (k) => k !== 'id' && k !== 'title' && typeof textbox[k] === 'object'
  );
  return langKey || null;
}

export function AnimationEditorCanvas({
  spread,
  language,
  zoomLevel = 100,
  onAddAnimation,
}: AnimationEditorCanvasProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [selectedGeometry, setSelectedGeometry] = useState<Geometry | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Scaled dimensions (same as spread-editor-panel)
  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(zoomLevel);

  // Calculate toolbar position
  const toolbarPosition = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
    gap: 8,
  });

  // Reset selection when spread changes
  useEffect(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setToolbarOpen(false);
    setSelectedGeometry(null);
  }, [spread.id]);

  // Deselect handler
  const handleDeselect = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setToolbarOpen(false);
    setSelectedGeometry(null);
  }, []);

  // Click outside handler
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!canvasRef.current?.contains(target)) {
        // Click outside canvas
        if (target.closest('[data-toolbar]')) return;
        if (target.closest('[data-radix-popper-content-wrapper]')) return;
        handleDeselect();
      }
    },
    [handleDeselect]
  );

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDeselect();
      }
    },
    [handleDeselect]
  );

  // Setup global listeners
  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // Canvas click handler (deselect when clicking empty area)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      handleDeselect();
    }
  }, [handleDeselect]);

  // Object selection handler
  const handleObjectSelect = useCallback((objectId: string) => {
    const object = spread.objects?.find((obj) => obj.id === objectId);
    if (!object) return;

    setSelectedItemId(objectId);
    setSelectedItemType('object');
    setSelectedGeometry(object.geometry);
    setToolbarOpen(true);
  }, [spread.objects]);

  // Textbox selection handler
  const handleTextboxSelect = useCallback((textboxId: string) => {
    const textbox = spread.textboxes?.find((tb) => tb.id === textboxId);
    if (!textbox) return;

    const langKey = getTextboxLanguageKey(textbox, language);
    if (!langKey) return;

    const textboxData = textbox[langKey] as { geometry: Geometry };
    if (!textboxData?.geometry) return;

    setSelectedItemId(textboxId);
    setSelectedItemType('textbox');
    setSelectedGeometry(textboxData.geometry);
    setToolbarOpen(true);
  }, [spread.textboxes, language]);

  // Toolbar option select handler
  const handleToolbarOptionSelect = useCallback(
    (type: AnimationMediaType) => {
      if (!selectedItemId || !selectedItemType) return;

      onAddAnimation({
        type,
        targetId: selectedItemId,
        targetType: selectedItemType,
        spreadId: spread.id,
      });

      setToolbarOpen(false);
    },
    [selectedItemId, selectedItemType, spread.id, onAddAnimation]
  );

  // Toolbar close handler
  const handleToolbarClose = useCallback(() => {
    setToolbarOpen(false);
  }, []);

  // Memoized textboxes with resolved language
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes.map((textbox) => {
      const langKey = getTextboxLanguageKey(textbox, language);
      if (!langKey) return null;
      const data = textbox[langKey] as {
        text: string;
        geometry: Geometry;
        typography: Typography;
        fill?: Fill;
        outline?: Outline;
      };
      if (!data?.geometry) return null;
      return { textbox, langKey, data };
    }).filter(Boolean);
  }, [spread.textboxes, language]);

  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      {/* Canvas container - sized like spread-editor-panel */}
      <div
        ref={canvasRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: 'transform',
        }}
        onClick={handleCanvasClick}
        tabIndex={0}
      >
        {/* Page Backgrounds using PageItem */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={spread.pages.length === 1 ? 'single' : pageIndex === 0 ? 'left' : 'right'}
            isSelected={false}
            onUpdatePage={() => {}} // Read-only in animation editor
            availableLayouts={[]}
            // No renderPageToolbar = not selectable
          />
        ))}

        {/* Page Divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: '50%', zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Objects (selectable) */}
        {spread.objects?.map((object, index) => (
          <EditableObject
            key={object.id}
            object={object}
            index={index}
            isSelected={selectedItemId === object.id && selectedItemType === 'object'}
            isEditable={true}
            onSelect={() => handleObjectSelect(object.id)}
          />
        ))}

        {/* Textboxes (selectable, not editable) */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          return (
            <EditableTextbox
              key={textbox.id}
              text={data.text}
              geometry={data.geometry}
              typography={data.typography}
              fill={data.fill}
              outline={data.outline}
              index={index}
              zIndex={TEXTBOX_Z_INDEX_BASE + index}
              isSelected={selectedItemId === textbox.id && selectedItemType === 'textbox'}
              isSelectable={true}
              isEditable={false}
              onSelect={() => handleTextboxSelect(textbox.id)}
              onTextChange={() => {}}
              onEditingChange={() => {}}
            />
          );
        })}

        {/* Selection overlay */}
        {selectedGeometry && <SelectionOverlay geometry={selectedGeometry} />}
      </div>

      {/* Toolbar (portal to document.body) - always render when open to allow measurement */}
      {toolbarOpen && selectedItemType && typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={toolbarRef}
            data-toolbar
            style={{
              position: 'fixed',
              top: toolbarPosition?.top ?? -9999,
              left: toolbarPosition?.left ?? -9999,
              zIndex: 9999,
              visibility: toolbarPosition ? 'visible' : 'hidden',
            }}
          >
            <AddAnimationToolbar
              position={toolbarPosition ?? { top: 0, left: 0 }}
              targetType={selectedItemType}
              onSelectOption={handleToolbarOptionSelect}
              onClose={handleToolbarClose}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

export default AnimationEditorCanvas;
