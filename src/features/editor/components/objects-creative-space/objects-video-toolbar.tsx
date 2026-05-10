// objects-video-toolbar.tsx - Floating toolbar for video items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadVideoToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  type BaseSpread,
  type VideoToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
import { createLogger } from "@/utils/logger";
import type { SpreadTag } from "@/types/spread-types";
import {
  clampGeometry,
  computeGeometryOnMediaReplace,
  GeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { ItemTagsSection } from "@/features/editor/components/objects-creative-space/item-tags-section";

const log = createLogger("Editor", "ObjectsVideoToolbar");

function getVideoNaturalDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read video dimensions"));
    };
    video.src = url;
  });
}

interface ObjectsVideoToolbarProps<TSpread extends BaseSpread> {
  context: VideoToolbarContext<TSpread>;
}

export function ObjectsVideoToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsVideoToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const { item, onUpdate, onDelete, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const handleTagsChange = useCallback(
    (tags: SpreadTag[]) => {
      log.info("ObjectsVideoToolbar", "tags change", {
        itemId: item.id,
        tagsCount: tags.length,
      });
      onUpdate({ tags });
    },
    [item.id, onUpdate]
  );

  const handleRotationChange = useCallback(
    (value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) {
        log.debug("ObjectsVideoToolbar", "rotation skip: NaN");
        return;
      }
      const clamped = (((num % 360) + 540) % 360) - 180;
      log.info("ObjectsVideoToolbar", "rotation change", { value: num, clamped });
      onUpdate({ geometry: { ...geometry, rotation: clamped } });
    },
    [geometry, onUpdate]
  );

  const handleRotationReset = useCallback(() => {
    if (!geometry.rotation) {
      log.debug("ObjectsVideoToolbar", "rotation reset: no-op (already 0)");
      return;
    }
    log.info("ObjectsVideoToolbar", "rotation reset");
    onUpdate({ geometry: { ...geometry, rotation: 0 } });
  }, [geometry, onUpdate]);

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 200 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 200 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 200 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 200 - geometry.y);
      log.debug("ObjectsVideoToolbar", "geometry change", {
        field,
        value: clamped,
      });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setIsUploading(true);
      log.info("ObjectsVideoToolbar", "upload started", {
        name: file.name,
        size: file.size,
      });

      try {
        const [{ publicUrl }, dimensions] = await Promise.all([
          uploadVideoToStorage(file, "video-objects"),
          getVideoNaturalDimensions(file),
        ]);

        // Preserve visual area, apply new media aspect, re-center.
        const nextGeometry = computeGeometryOnMediaReplace({
          old: geometry,
          naturalW: dimensions.width,
          naturalH: dimensions.height,
          canvasW: canvasWidth,
          canvasH: canvasHeight,
        });

        log.debug("ObjectsVideoToolbar", "video dimensions", {
          natural: `${dimensions.width}x${dimensions.height}`,
          old: geometry,
          next: nextGeometry,
        });

        onUpdate({
          media_url: publicUrl,
          geometry: nextGeometry,
        });
        toast.success("Video uploaded");
        canvasRef.current?.click();
        log.info("ObjectsVideoToolbar", "upload success", { url: publicUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("ObjectsVideoToolbar", "upload failed", { error: message });
      } finally {
        setIsUploading(false);
      }
    },
    [geometry, onUpdate, canvasRef, canvasWidth, canvasHeight]
  );

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="video"
        role="toolbar"
        aria-label="Video formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Row 1: Tags */}
        <ItemTagsSection
          value={item.tags}
          onChange={handleTagsChange}
          ariaLabel="Video tags"
        />

        {/* Row 2-3: Geometry */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
          rotation={geometry.rotation ?? 0}
          onRotationChange={handleRotationChange}
          onRotationReset={handleRotationReset}
        />

        {/* Footer */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Upload}
              label={isUploading ? "Uploading..." : "Upload video"}
              onClick={handleUploadClick}
              disabled={isUploading}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete video"
            onClick={onDelete}
            variant="destructive"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
