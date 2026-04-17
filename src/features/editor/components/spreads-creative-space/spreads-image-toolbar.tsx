// spreads-image-toolbar.tsx - Floating toolbar for illustration image items in Spreads Creative Space
// Simpler than ObjectsImageToolbar: no MediaIdentitySection, no Split/Crop.
// Provides: aspect ratio display, geometry editing, and footer actions (Generate, Upload, Delete).
"use client";

import { useMemo, useRef, useCallback, useState } from "react";
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
import { Sparkles, Upload, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { uploadImageToStorageWithNormalize, ImageTooTallError } from "@/apis/storage-api";
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
  DEFAULT_ASPECT_RATIO,
  type AspectRatio,
} from "@/constants/aspect-ratio-constants";
import {
  calculateGeometryForRatio,
  detectRatioFromGeometry,
  findClosestRatio,
  getImageNaturalDimensions,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const canvasAspectRatio = useCanvasAspectRatio();

  const {
    item,
    onUpdate,
    onDelete,
    onGenerateImage,
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

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so same file can be re-selected
      e.target.value = "";

      setIsUploading(true);
      log.info("SpreadsImageToolbar", "upload started", {
        name: file.name,
        size: file.size,
      });

      try {
        const uploadResult = await uploadImageToStorageWithNormalize(file, "illustrations");
        const { publicUrl } = uploadResult;

        // Server-authoritative ratio for exact-match + slow-path; fallback client dim-read for gif/svg passthrough
        const ratio: AspectRatio = uploadResult.ratio !== undefined
          ? uploadResult.ratio
          : await getImageNaturalDimensions(file)
              .then(({ width, height }) => findClosestRatio(width, height))
              .catch(() => DEFAULT_ASPECT_RATIO);

        log.debug("SpreadsImageToolbar", "upload ratio resolved", {
          ratio,
          serverProvided: uploadResult.ratio !== undefined,
        });

        // Deselect all existing illustrations, add new one as selected
        const existingIllustrations = (item.illustrations ?? []).map((i) => ({
          ...i,
          is_selected: false,
        }));

        const newGeometry = calculateGeometryForRatio(geometry, ratio, canvasAspectRatio, clampGeometry);
        onUpdate({
          media_url: publicUrl,
          aspect_ratio: ratio,
          geometry: newGeometry,
          illustrations: [
            ...existingIllustrations,
            {
              media_url: publicUrl,
              created_time: new Date().toISOString(),
              is_selected: true,
            },
          ],
        });

        toast.success("Image uploaded");
        // Close toolbar by deselecting via canvas background click
        canvasRef.current?.click();
        log.info("SpreadsImageToolbar", "upload success", { url: publicUrl, ratio });
      } catch (err) {
        if (err instanceof ImageTooTallError) {
          toast.error("Image too tall. Minimum supported ratio is 9:16. Please crop and try again.");
          log.warn("SpreadsImageToolbar", "upload blocked: too tall", { srcRatio: err.srcRatio });
        } else {
          const message = err instanceof Error ? err.message : "Upload failed";
          toast.error(message);
          log.error("SpreadsImageToolbar", "upload failed", { error: message });
        }
      } finally {
        setIsUploading(false);
      }
    },
    [geometry, item.illustrations, onUpdate, canvasRef]
  );

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

        {/* Footer: Generate + Upload on the left, Delete on the right */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Sparkles}
              label="Generate image"
              onClick={onGenerateImage}
            />
            <ToolbarIconButton
              icon={Upload}
              label={isUploading ? "Uploading..." : "Upload image"}
              onClick={handleUploadClick}
              disabled={isUploading}
            />
            {onClone && (
              <ToolbarIconButton
                icon={Copy}
                label="Clone image"
                onClick={onClone}
              />
            )}
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete image"
            onClick={onDelete}
            variant="destructive"
          />
        </div>

        {/* Hidden file input for upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
