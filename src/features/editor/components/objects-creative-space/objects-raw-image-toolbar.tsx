// objects-raw-image-toolbar.tsx - Read-only toolbar for raw image items (geometry display + duplicate)
"use client";

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Copy } from "lucide-react";
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
  const { item, onClone, selectedGeometry, canvasRef } = context;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const handleClone = useCallback(() => {
    if (onClone) {
      log.info("handleClone", "duplicating raw image as new image item", { itemId: item.id });
      onClone();
    } else {
      toast.info("Duplicate feature not available");
    }
  }, [onClone, item.id]);

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
          <ToolbarIconButton icon={Copy} label="Duplicate" onClick={handleClone} />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
