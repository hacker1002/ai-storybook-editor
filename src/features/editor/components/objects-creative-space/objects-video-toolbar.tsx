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
  CANVAS,
  type BaseSpread,
  type VideoToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type { SpreadItemMediaType } from "@/types/spread-types";
import {
  clampGeometry,
  GeometrySection,
  MediaIdentitySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";

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
  const { item, onUpdate, onDelete, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const currentType = (item.type ?? "raw") as SpreadItemMediaType;
  const currentName = item.name ?? "";
  const currentState = item.variant ?? "default";

  const handleTypeChange = useCallback(
    (newType: string) => {
      log.debug("ObjectsVideoToolbar", "type change", {
        from: currentType,
        to: newType,
      });
      onUpdate({
        type: newType as SpreadItemMediaType,
        name: undefined,
        variant: undefined,
      });
    },
    [currentType, onUpdate]
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      log.debug("ObjectsVideoToolbar", "name change", { name: newName });
      onUpdate({ name: newName });
    },
    [onUpdate]
  );

  const handleStateChange = useCallback(
    (newState: string) => {
      log.debug("ObjectsVideoToolbar", "state change", { variant: newState });
      onUpdate({ variant: newState });
    },
    [onUpdate]
  );

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 100 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 100 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 100 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 100 - geometry.y);
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

        // Convert video pixel dimensions to canvas percentage, preserving aspect ratio.
        // If video exceeds canvas, scale so the longer side is 80% of canvas; other side follows ratio.
        const rawW = (dimensions.width / CANVAS.BASE_WIDTH) * 100;
        const rawH = (dimensions.height / CANVAS.BASE_HEIGHT) * 100;
        const MAX_PERCENT = 80;
        let newW: number;
        let newH: number;
        if (rawW <= MAX_PERCENT && rawH <= MAX_PERCENT) {
          // Video fits within canvas — use natural size
          newW = rawW;
          newH = rawH;
        } else {
          // Scale down: fit the longer dimension to MAX_PERCENT, compute other from aspect ratio
          const aspectRatio = dimensions.width / dimensions.height;
          const canvasAspect = CANVAS.BASE_WIDTH / CANVAS.BASE_HEIGHT;
          if (aspectRatio >= canvasAspect) {
            // Landscape or square-ish: width is the constraining dimension
            newW = MAX_PERCENT;
            newH = (MAX_PERCENT / aspectRatio) * canvasAspect;
          } else {
            // Portrait: height is the constraining dimension
            newH = MAX_PERCENT;
            newW = (MAX_PERCENT * aspectRatio) / canvasAspect;
          }
        }
        newW = clampGeometry("w", newW);
        newH = clampGeometry("h", newH);
        // Re-center around current center, clamped to canvas bounds
        const centerX = geometry.x + geometry.w / 2;
        const centerY = geometry.y + geometry.h / 2;
        const newX = clampGeometry("x", Math.min(centerX - newW / 2, 100 - newW));
        const newY = clampGeometry("y", Math.min(centerY - newH / 2, 100 - newH));

        log.debug("ObjectsVideoToolbar", "video dimensions", {
          natural: `${dimensions.width}x${dimensions.height}`,
          geometry: { x: newX, y: newY, w: newW, h: newH },
        });

        onUpdate({
          media_url: publicUrl,
          geometry: { x: newX, y: newY, w: newW, h: newH },
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
    [geometry, onUpdate, canvasRef]
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
        {/* Row 1-2: Type, Name, State */}
        <MediaIdentitySection
          type={currentType}
          name={currentName}
          state={currentState}
          onTypeChange={handleTypeChange}
          onNameChange={handleNameChange}
          onStateChange={handleStateChange}
          mediaLabel="Video"
        />

        {/* Row 3-4: Geometry */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
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
