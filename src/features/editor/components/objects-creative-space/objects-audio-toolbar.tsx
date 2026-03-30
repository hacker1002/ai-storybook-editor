// objects-audio-toolbar.tsx - Floating toolbar for audio items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadAudioToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  type BaseSpread,
  type AudioToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type { SpreadItemMediaType } from "@/types/spread-types";
import {
  clampGeometry,
  GeometrySection,
  MediaIdentitySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "ObjectsAudioToolbar");


interface ObjectsAudioToolbarProps<TSpread extends BaseSpread> {
  context: AudioToolbarContext<TSpread>;
}

export function ObjectsAudioToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsAudioToolbarProps<TSpread>) {
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
      log.debug("ObjectsAudioToolbar", "type change", {
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
      log.debug("ObjectsAudioToolbar", "name change", { name: newName });
      onUpdate({ name: newName });
    },
    [onUpdate]
  );

  const handleStateChange = useCallback(
    (newState: string) => {
      log.debug("ObjectsAudioToolbar", "state change", { variant: newState });
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
      log.debug("ObjectsAudioToolbar", "geometry change", {
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
      log.info("ObjectsAudioToolbar", "upload started", {
        name: file.name,
        size: file.size,
      });

      try {
        const { publicUrl } = await uploadAudioToStorage(file, "audio-objects");
        onUpdate({ media_url: publicUrl });
        toast.success("Audio uploaded");
        canvasRef.current?.click();
        log.info("ObjectsAudioToolbar", "upload success", { url: publicUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("ObjectsAudioToolbar", "upload failed", { error: message });
      } finally {
        setIsUploading(false);
      }
    },
    [onUpdate, canvasRef]
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
        data-toolbar="audio"
        role="toolbar"
        aria-label="Audio formatting toolbar"
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
          mediaLabel="Audio"
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
              label={isUploading ? "Uploading..." : "Upload audio"}
              onClick={handleUploadClick}
              disabled={isUploading}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete audio"
            onClick={onDelete}
            variant="destructive"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/aac"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
