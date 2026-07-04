// sketch-image-toolbar.tsx — Floating, footer-only toolbar for a selected sketch page image on
// the dedicated SketchSpreadCanvas (design sketch-spreads-creative-space/05-sketch-image-toolbar.md).
//
// Reduced footer: Edit + Extract only (no Generate — sketch pages regenerate via the per-page
// Generate-SPREAD job, not this toolbar; no body/geometry/delete/duplicate — the page image is
// geometry-locked and never deleted, only versioned). "Dumb" component: positions itself + renders;
// the parent (SketchSpreadCanvas) injects the open-modal callbacks and owns the write
// (caller-owns-write → result maps to a new page-image version).
//
// Flat props (design §2.2) — unlike RemixImageToolbar's context object, sketch needs no `item`.
"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { Layers, Pencil } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToolbarPosition } from "@/features/editor/components/canvas-spread-view";
import { ToolbarIconButton } from "@/features/editor/components/shared-components";
import { createLogger } from "@/utils/logger";
import type { RefObject } from "react";
import type { Geometry } from "@/types/spread-types";

const log = createLogger("Editor", "SketchImageToolbar");

export interface SketchImageToolbarProps {
  /** Synthesized, spread-relative % geometry of the selected page ('full'/'left'/'right'). */
  selectedGeometry: Geometry | null;
  /** The SketchSpreadCanvas frame element the geometry is measured against. */
  canvasRef: RefObject<HTMLDivElement | null>;
  onEditImage: () => void;
  onExtractImage: () => void;
}

export function SketchImageToolbar({
  selectedGeometry,
  canvasRef,
  onEditImage,
  onExtractImage,
}: SketchImageToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

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
    log.debug("handleEdit", "open sketch edit modal", { placement: position?.placement });
    onEditImage();
  };

  const handleExtract = () => {
    log.debug("handleExtract", "open sketch extract modal", { placement: position?.placement });
    onExtractImage();
  };

  const content = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="image"
        role="toolbar"
        aria-label="Sketch image toolbar"
        className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
        style={toolbarStyle}
      >
        <ToolbarIconButton icon={Pencil} label="Edit image" onClick={handleEdit} />
        <ToolbarIconButton icon={Layers} label="Extract from image" onClick={handleExtract} />
      </div>
    </TooltipProvider>
  );

  return createPortal(content, document.body);
}

export default SketchImageToolbar;
