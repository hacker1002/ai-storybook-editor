// objects-raw-image-toolbar.tsx - Read-only toolbar for raw image items (geometry display + split/crop)
"use client";

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Scissors, Crop } from "lucide-react";
import { toast } from "sonner";
import {
  useToolbarPosition,
  type BaseSpread,
  type ImageToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import {
  ReadOnlyGeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "ObjectsRawImageToolbar");

interface ObjectsRawImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}

export function ObjectsRawImageToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsRawImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, onSplitImage, onCropImage, selectedGeometry, canvasRef } =
    context;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const handleSplit = useCallback(() => {
    if (onSplitImage) {
      log.info("handleSplit", "splitting raw image", { itemId: item.id });
      onSplitImage();
    } else {
      toast.info("Split feature not available");
    }
  }, [onSplitImage, item.id]);

  const handleCrop = useCallback(() => {
    if (onCropImage) {
      log.info("handleCrop", "cropping raw image", { itemId: item.id });
      onCropImage();
    } else {
      toast.info("Crop feature not available");
    }
  }, [onCropImage, item.id]);

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
        data-toolbar="raw-image"
        role="toolbar"
        aria-label="Raw image toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        <ReadOnlyGeometrySection geometry={item.geometry} />

        <div className="flex items-center gap-1 border-t border-border pt-2">
          <ToolbarIconButton
            icon={Scissors}
            label="Split"
            onClick={handleSplit}
          />
          <ToolbarIconButton icon={Crop} label="Crop" onClick={handleCrop} />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
