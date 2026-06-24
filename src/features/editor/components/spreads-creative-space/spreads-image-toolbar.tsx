// spreads-image-toolbar.tsx - Floating toolbar for illustration image items in Spreads Creative Space
// Footer unified with Objects (matrix): Generate · Edit · Extract · Duplicate | Delete.
// Upload is no longer a toolbar button — it lives in the Generate modal's Upload mode.
"use client";

import { useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Pencil, Layers, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useToolbarPosition,
  type BaseSpread,
  type ImageToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { useCanvasAspectRatio } from "@/stores/editor-settings-store";
import { createLogger } from "@/utils/logger";
import {
  clampGeometry,
  GeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import {
  ASPECT_RATIOS,
  type AspectRatio,
} from "@/constants/aspect-ratio-constants";
import {
  calculateGeometryForRatio,
  detectRatioFromGeometry,
} from "@/utils/aspect-ratio-utils";

const log = createLogger("Editor", "SpreadsImageToolbar");

// === Component ===

interface SpreadsImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}

export function SpreadsImageToolbar<TSpread extends BaseSpread>({
  context,
}: SpreadsImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const canvasAspectRatio = useCanvasAspectRatio();

  const {
    item,
    onUpdate,
    onDelete,
    onGenerateImage,
    onEditImage,
    onExtractImage,
    onClone,
    selectedGeometry,
    canvasRef,
  } = context;
  const { geometry } = item;

  // === Aspect ratio detection (read-only display) ===

  const detectedRatio = useMemo(() => {
    if (item.aspect_ratio) return item.aspect_ratio;
    return detectRatioFromGeometry(geometry.w, geometry.h, canvasAspectRatio);
  }, [item.aspect_ratio, geometry.w, geometry.h, canvasAspectRatio]);

  // === Handlers ===

  const handleRatioSelect = useCallback(
    (ratioValue: AspectRatio) => {
      log.debug("SpreadsImageToolbar", "ratio change", { ratio: ratioValue });
      const newGeometry = calculateGeometryForRatio(geometry, ratioValue, canvasAspectRatio, clampGeometry);
      onUpdate({ geometry: newGeometry, aspect_ratio: ratioValue });
    },
    [geometry, onUpdate, canvasAspectRatio]
  );

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      // Allow items into bleed+staging zone (OVERFLOW_MAX=100 beyond each trim edge)
      if (field === "x") clamped = Math.min(clamped, 200 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 200 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 200 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 200 - geometry.y);
      log.debug("SpreadsImageToolbar", "geometry change", {
        field,
        value: clamped,
      });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  const handleEdit = useCallback(() => {
    if (onEditImage) {
      log.info("handleEdit", "open edit modal", { itemId: item.id });
      onEditImage();
    } else {
      toast.info("Edit feature not available");
    }
  }, [onEditImage, item.id]);

  const handleExtract = useCallback(() => {
    if (onExtractImage) {
      log.info("handleExtract", "open extract modal", { itemId: item.id });
      onExtractImage();
    } else {
      toast.info("Extract feature not available");
    }
  }, [onExtractImage, item.id]);

  const handleDuplicate = useCallback(() => {
    if (onClone) {
      log.info("handleDuplicate", "duplicate illustration image", { itemId: item.id });
      onClone();
    } else {
      toast.info("Duplicate feature not available");
    }
  }, [onClone, item.id]);

  // === Positioning ===

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  // === Render ===

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="image"
        role="toolbar"
        aria-label="Illustration image formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Aspect Ratio row */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Ratio
          </Label>
          <Select
            value={detectedRatio ?? ""}
            onValueChange={(v) => handleRatioSelect(v as AspectRatio)}
          >
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Aspect ratio"
            >
              <SelectValue placeholder="Select ratio..." />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Geometry section */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* === FOOTER === Generate · Edit · Extract · Duplicate | Delete (matrix unify) */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Sparkles}
              label="Generate image"
              onClick={onGenerateImage}
            />
            <ToolbarIconButton
              icon={Pencil}
              label="Edit image"
              onClick={handleEdit}
            />
            <ToolbarIconButton
              icon={Layers}
              label="Extract"
              onClick={handleExtract}
            />
            <ToolbarIconButton
              icon={Copy}
              label="Duplicate"
              onClick={handleDuplicate}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete image"
            onClick={onDelete}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
