// remix-image-toolbar.tsx — Floating, footer-only toolbar for an image layer on the remix
// canvas (design remix-creative-space/06-remix-image-toolbar.md).
//
// Phase 1 = Edit ONLY. The Generate button renders only when `onGenerateImage` is supplied
// (Phase 2 — GenerateImageModal must first be made store-agnostic), so no dead button ships.
// "Dumb" component: positions itself + renders; the parent injects the open-modal callbacks.
//
// Own props type (NOT the shared `ImageToolbarContext`, whose `onGenerateImage` is required) so
// hiding Generate in Phase 1 stays zero-impact on the Spreads/Objects toolbars.
"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { Pencil, Sparkles } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToolbarPosition } from "@/features/editor/components/canvas-spread-view";
import { ToolbarIconButton } from "@/features/editor/components/shared-components";
import { createLogger } from "@/utils/logger";
import type { RefObject } from "react";
import type { Geometry } from "@/types/canvas-types";
import type { RemixSpreadImage } from "@/types/remix";

const log = createLogger("Editor", "RemixImageToolbar");

export interface RemixImageToolbarContext {
  item: RemixSpreadImage;
  selectedGeometry: Geometry | null;
  canvasRef: RefObject<HTMLDivElement | null>;
  onEditImage: () => void;
  /** Phase 2 — when omitted (Phase 1) the Generate button is not rendered. */
  onGenerateImage?: () => void;
}

interface RemixImageToolbarProps {
  context: RemixImageToolbarContext;
}

export function RemixImageToolbar({ context }: RemixImageToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, selectedGeometry, canvasRef, onEditImage, onGenerateImage } = context;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  // Soft-hide until geometry is measured (avoids a flash at 0,0).
  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const handleEdit = () => {
    log.debug("handleEdit", "open edit modal", { itemId: item.id });
    onEditImage();
  };

  const handleGenerate = () => {
    log.debug("handleGenerate", "open generate modal", { itemId: item.id });
    onGenerateImage?.();
  };

  const content = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="image"
        role="toolbar"
        aria-label="Remix image toolbar"
        className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
        style={toolbarStyle}
      >
        {onGenerateImage && (
          <ToolbarIconButton icon={Sparkles} label="Generate image" onClick={handleGenerate} />
        )}
        <ToolbarIconButton icon={Pencil} label="Edit image" onClick={handleEdit} />
      </div>
    </TooltipProvider>
  );

  return createPortal(content, document.body);
}
