// animation-editor-canvas.tsx - Main canvas for animation editor mode
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { EditableTextbox, getScaledDimensions, getFirstTextboxKey } from '../editor-shared';
import { Z_INDEX } from '@/constants/spread-constants';
import type { Geometry, Typography, Fill, Outline } from '@/types/spread-types';
import { EditableImage, EditableShape, EditableVideo, EditableAudio, EditableQuiz } from '../canvas-spread-view';
import { PageItem } from '../canvas-spread-view/page-item';
import { SelectionOverlay } from './selection-overlay';
import type { ItemType, AnimationEditorCanvasProps } from './types';
import { TEXTBOX_Z_INDEX_BASE } from './constants';

export function AnimationEditorCanvas({
  spread,
  zoomLevel,
  selectedItemId: externalItemId,
  selectedItemType: externalItemType,
  onItemSelect,
}: AnimationEditorCanvasProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [selectedGeometry, setSelectedGeometry] = useState<Geometry | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(zoomLevel);

  // Reset selection when spread changes
  useEffect(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setSelectedGeometry(null);
    onItemSelect(null, null);
  }, [spread.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from external selection (sidebar click → canvas highlight)
  useEffect(() => {
    if (externalItemId === undefined || externalItemType === undefined) return;
    if (externalItemId === selectedItemId && externalItemType === selectedItemType) return;

    if (!externalItemId || !externalItemType) {
      setSelectedItemId(null);
      setSelectedItemType(null);
      setSelectedGeometry(null);
      return;
    }

    setSelectedItemId(externalItemId);
    setSelectedItemType(externalItemType);

    // Resolve geometry for selection overlay
    let geometry: Geometry | null = null;
    if (externalItemType === 'image') {
      geometry = spread.images?.find((i) => i.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === 'textbox') {
      const tb = spread.textboxes?.find((t) => t.id === externalItemId);
      if (tb) {
        const langKey = getFirstTextboxKey(tb);
        if (langKey) geometry = (tb[langKey] as { geometry: Geometry })?.geometry ?? null;
      }
    } else if (externalItemType === 'shape') {
      geometry = spread.shapes?.find((s) => s.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === 'video') {
      geometry = spread.videos?.find((v) => v.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === 'audio' || externalItemType === 'quiz') {
      // Audio/quiz use fixed-size icons — selection handled by the component itself
      geometry = null;
    }
    setSelectedGeometry(geometry);
  }, [externalItemId, externalItemType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect handler
  const handleDeselect = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setSelectedGeometry(null);
    onItemSelect(null, null);
  }, [onItemSelect]);

  // Click outside handler
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!canvasRef.current?.contains(target)) {
        // Click outside canvas — skip deselect for known UI panels
        if (target.closest('[data-toolbar]')) return;
        if (target.closest('[data-radix-popper-content-wrapper]')) return;
        if (target.closest('[role="navigation"]')) return; // animation editor sidebar
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

  // Image selection handler
  const handleImageSelect = useCallback((imageId: string) => {
    const image = spread.images?.find((img) => img.id === imageId);
    if (!image) return;

    setSelectedItemId(imageId);
    setSelectedItemType('image');
    setSelectedGeometry(image.geometry);
    onItemSelect('image', imageId);
  }, [spread.images, onItemSelect]);

  // Textbox selection handler
  const handleTextboxSelect = useCallback((textboxId: string) => {
    const textbox = spread.textboxes?.find((tb) => tb.id === textboxId);
    if (!textbox) return;

    const langKey = getFirstTextboxKey(textbox);
    if (!langKey) return;

    const textboxData = textbox[langKey] as { geometry: Geometry };
    if (!textboxData?.geometry) return;

    setSelectedItemId(textboxId);
    setSelectedItemType('textbox');
    setSelectedGeometry(textboxData.geometry);
    onItemSelect('textbox', textboxId);
  }, [spread.textboxes, onItemSelect]);

  // Shape selection handler
  const handleShapeSelect = useCallback((shapeId: string) => {
    const shape = spread.shapes?.find((s) => s.id === shapeId);
    if (!shape) return;
    setSelectedItemId(shapeId);
    setSelectedItemType('shape');
    setSelectedGeometry(shape.geometry);
    onItemSelect('shape', shapeId);
  }, [spread.shapes, onItemSelect]);

  // Video selection handler
  const handleVideoSelect = useCallback((videoId: string) => {
    const video = spread.videos?.find((v) => v.id === videoId);
    if (!video) return;
    setSelectedItemId(videoId);
    setSelectedItemType('video');
    setSelectedGeometry(video.geometry);
    onItemSelect('video', videoId);
  }, [spread.videos, onItemSelect]);

  // Audio selection handler (no SelectionOverlay — component handles its own selection border)
  const handleAudioSelect = useCallback((audioId: string) => {
    setSelectedItemId(audioId);
    setSelectedItemType('audio');
    setSelectedGeometry(null);
    onItemSelect('audio', audioId);
  }, [onItemSelect]);

  // Quiz selection handler (no SelectionOverlay — component handles its own selection border)
  const handleQuizSelect = useCallback((quizId: string) => {
    setSelectedItemId(quizId);
    setSelectedItemType('quiz');
    setSelectedGeometry(null);
    onItemSelect('quiz', quizId);
  }, [onItemSelect]);

  // Memoized textboxes with resolved language
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes.map((textbox) => {
      const langKey = getFirstTextboxKey(textbox);
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
  }, [spread.textboxes]);

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

        {/* Images (selectable) */}
        {spread.images?.map((image, index) => (
          <EditableImage
            key={image.id}
            image={image}
            index={index}
            isSelected={selectedItemId === image.id && selectedItemType === 'image'}
            isEditable={true}
            onSelect={() => handleImageSelect(image.id)}
          />
        ))}

        {/* Shapes (selectable) */}
        {spread.shapes?.map((shape, index) => (
          <EditableShape
            key={shape.id}
            shape={shape}
            index={index}
            isSelected={selectedItemId === shape.id && selectedItemType === 'shape'}
            isEditable={true}
            onSelect={() => handleShapeSelect(shape.id)}
          />
        ))}

        {/* Videos (selectable) */}
        {spread.videos?.map((video, index) => (
          <EditableVideo
            key={video.id}
            video={video}
            index={index}
            isSelected={selectedItemId === video.id && selectedItemType === 'video'}
            isEditable={true}
            onSelect={() => handleVideoSelect(video.id)}
          />
        ))}

        {/* Audios (selectable) */}
        {spread.audios?.map((audio, index) => (
          <EditableAudio
            key={audio.id}
            audio={audio}
            index={index}
            isSelected={selectedItemId === audio.id && selectedItemType === 'audio'}
            isEditable={true}
            onSelect={() => handleAudioSelect(audio.id)}
          />
        ))}

        {/* Quizzes (selectable) */}
        {spread.quizzes?.map((quiz, index) => (
          <EditableQuiz
            key={quiz.id}
            quiz={quiz}
            index={index}
            isSelected={selectedItemId === quiz.id && selectedItemType === 'quiz'}
            isEditable={true}
            onSelect={() => handleQuizSelect(quiz.id)}
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
    </div>
  );
}
