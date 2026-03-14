// remix-editor-canvas.tsx - Main canvas for remix/AI swap editor mode
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { EditableTextbox, useToolbarPosition, getScaledDimensions, getFirstTextboxKey } from "../editor-shared";
import { Z_INDEX } from "@/constants/spread-constants";
import type { Geometry, Typography, Fill, Outline } from "@/types/spread-types";
import { EditableImage, EditableShape, EditableVideo, EditableAudio } from "../canvas-spread-view";
import { PageItem } from "../canvas-spread-view/page-item";
import { PromptToolbar } from "./prompt-toolbar";
import { SelectionOverlay } from "./selection-overlay";
import type { RemixEditorCanvasProps } from "./types";
import { TEXTBOX_Z_INDEX_BASE } from "./constants";

export function RemixEditorCanvas({
  spread,
  zoomLevel,
  assets,
  onAssetSwap,
  onTextChange,
}: RemixEditorCanvasProps) {
  // Selection state - swappable objects (shows toolbar)
  const [selectedSwappableId, setSelectedSwappableId] = useState<string | null>(null);
  const [selectedSwappableGeometry, setSelectedSwappableGeometry] = useState<Geometry | null>(null);

  // Selection state - textboxes (no toolbar, just visual selection)
  const [selectedTextboxId, setSelectedTextboxId] = useState<string | null>(null);

  // Toolbar state
  const [prompt, setPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Text editing state
  const [editingTextboxId, setEditingTextboxId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const { width: scaledWidth, height: scaledHeight } =
    getScaledDimensions(zoomLevel);

  // Calculate toolbar position
  const toolbarPosition = useToolbarPosition({
    geometry: selectedSwappableGeometry,
    canvasRef,
    toolbarRef,
    gap: 8,
  });

  // Compute swappable keys from assets (use target.key to match image.name)
  const swappableKeys = useMemo(() => {
    return assets.map((a) => a.target.key);
  }, [assets]);

  // Check if image is swappable
  const isSwappable = useCallback(
    (imageName: string | undefined) => {
      if (!imageName) return false;
      return swappableKeys.includes(imageName);
    },
    [swappableKeys]
  );

  // Reset selection when spread changes
  useEffect(() => {
    setSelectedSwappableId(null);
    setSelectedSwappableGeometry(null);
    setSelectedTextboxId(null);
    setPrompt("");
    setReferenceImage(null);
    setEditingTextboxId(null);
  }, [spread.id]);

  // Deselect swappable handler
  const handleDeselectSwappable = useCallback(() => {
    setSelectedSwappableId(null);
    setSelectedSwappableGeometry(null);
    setPrompt("");
    setReferenceImage(null);
  }, []);

  // Deselect all handler
  const handleDeselectAll = useCallback(() => {
    setSelectedSwappableId(null);
    setSelectedSwappableGeometry(null);
    setSelectedTextboxId(null);
    setPrompt("");
    setReferenceImage(null);
  }, []);

  // Click outside handler
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Skip toolbar and popover clicks
      if (target.closest("[data-toolbar]")) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;

      // Deselect all when clicking outside canvas
      if (!canvasRef.current?.contains(target)) {
        handleDeselectAll();
      }
    },
    [handleDeselectAll]
  );

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDeselectAll();
        setEditingTextboxId(null);
      }
    },
    [handleDeselectAll]
  );

  // Setup global listeners
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // Canvas click handler (deselect when clicking empty area)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        handleDeselectAll();
        setEditingTextboxId(null);
      }
    },
    [handleDeselectAll]
  );

  // Image selection handler - only for swappable images
  const handleImageSelect = useCallback(
    (imageId: string) => {
      const image = spread.images?.find((img) => img.id === imageId);
      if (!image) return;

      // Only select if swappable
      if (!isSwappable(image.name)) return;

      setSelectedSwappableId(imageId);
      setSelectedSwappableGeometry(image.geometry);
      setSelectedTextboxId(null);
      setPrompt("");
      setReferenceImage(null);
      setEditingTextboxId(null);
    },
    [spread.images, isSwappable]
  );

  // Textbox selection handler - deselects swappable, no toolbar
  const handleTextboxSelect = useCallback(
    (textboxId: string) => {
      setSelectedTextboxId(textboxId);
      // Deselect swappable when selecting textbox
      setSelectedSwappableId(null);
      setSelectedSwappableGeometry(null);
      setPrompt("");
      setReferenceImage(null);
    },
    []
  );

  // Textbox text change handler
  const handleTextChange = useCallback(
    (textboxId: string, newText: string) => {
      if (onTextChange) {
        onTextChange(textboxId, newText);
      }
    },
    [onTextChange]
  );

  // Textbox editing state change handler
  const handleTextboxEditingChange = useCallback((isEditing: boolean) => {
    if (!isEditing) {
      setEditingTextboxId(null);
    }
  }, []);

  // Submit handler for asset swap
  const handleSubmit = useCallback(async () => {
    if (!selectedSwappableId || !prompt.trim()) return;

    setIsSubmitting(true);
    try {
      await onAssetSwap({
        prompt,
        referenceImage,
        targetId: selectedSwappableId,
        spreadId: spread.id,
      });
      // Keep item selected for iteration, clear prompt/image
      setPrompt("");
      setReferenceImage(null);
    } catch (error) {
      console.error("Asset swap failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSwappableId, prompt, referenceImage, spread.id, onAssetSwap]);

  // Toolbar close handler
  const handleToolbarClose = useCallback(() => {
    handleDeselectSwappable();
  }, [handleDeselectSwappable]);

  // Memoized textboxes with resolved language
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes
      .map((textbox) => {
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
      })
      .filter(Boolean);
  }, [spread.textboxes]);

  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      {/* Canvas container */}
      <div
        ref={canvasRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
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
            position={
              spread.pages.length === 1
                ? "single"
                : pageIndex === 0
                ? "left"
                : "right"
            }
            isSelected={false}
            onUpdatePage={() => {}} // Read-only in remix editor
            availableLayouts={[]}
            // No renderPageToolbar = not selectable
          />
        ))}

        {/* Page Divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: "50%", zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Images (swappable ones are selectable) */}
        {spread.images?.map((image, index) => (
          <EditableImage
            key={image.id}
            image={image}
            index={index}
            isSelected={selectedSwappableId === image.id}
            isEditable={isSwappable(image.name)}
            onSelect={() => handleImageSelect(image.id)}
          />
        ))}

        {/* Shapes (render-only) */}
        {spread.shapes?.map((shape, index) => (
          <EditableShape
            key={shape.id}
            shape={shape}
            index={index}
            isSelected={false}
            isEditable={false}
            onSelect={() => {}}
          />
        ))}

        {/* Videos (render-only) */}
        {spread.videos?.map((video, index) => (
          <EditableVideo
            key={video.id}
            video={video}
            index={index}
            isSelected={false}
            isEditable={false}
            onSelect={() => {}}
          />
        ))}

        {/* Audios (render-only) */}
        {spread.audios?.map((audio, index) => (
          <EditableAudio
            key={audio.id}
            audio={audio}
            index={index}
            isSelected={false}
            isEditable={false}
            onSelect={() => {}}
          />
        ))}

        {/* Textboxes (selectable and editable) */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          const isEditing = editingTextboxId === textbox.id;
          const isTextboxSelected = selectedTextboxId === textbox.id;

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
              isSelected={isTextboxSelected || isEditing}
              isSelectable={true}
              isEditable={true}
              onSelect={() => handleTextboxSelect(textbox.id)}
              onTextChange={(newText) => handleTextChange(textbox.id, newText)}
              onEditingChange={handleTextboxEditingChange}
            />
          );
        })}

        {/* Selection overlay for swappable objects */}
        {selectedSwappableGeometry && <SelectionOverlay geometry={selectedSwappableGeometry} />}
      </div>

      {/* Toolbar (portal to document.body) - only for swappable objects */}
      {selectedSwappableId &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={toolbarRef}
            data-toolbar
            style={{
              position: "fixed",
              top: toolbarPosition?.top ?? -9999,
              left: toolbarPosition?.left ?? -9999,
              zIndex: 9999,
              visibility: toolbarPosition ? "visible" : "hidden",
            }}
          >
            <PromptToolbar
              position={toolbarPosition ?? { top: 0, left: 0 }}
              prompt={prompt}
              referenceImage={referenceImage}
              isSubmitting={isSubmitting}
              onPromptChange={setPrompt}
              onReferenceUpload={setReferenceImage}
              onSubmit={handleSubmit}
              onClose={handleToolbarClose}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
