// objects-image-toolbar.tsx - Floating toolbar for image items on canvas in Objects Creative Space
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Scissors, Crop, Sparkles, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadImageToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  CANVAS,
  type BaseSpread,
  type ImageToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type { SpreadItemMediaType } from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsImageToolbar");

// === Constants ===

const IMAGE_TYPE_OPTIONS: { label: string; value: SpreadItemMediaType }[] = [
  { label: "Character", value: "character" },
  { label: "Prop", value: "prop" },
  { label: "Background", value: "background" },
  { label: "Foreground", value: "foreground" },
  { label: "Raw", value: "raw" },
  { label: "Other", value: "other" },
];

const COMMON_RATIOS = [
  { label: "1:1", value: "1:1", numeric: 1 },
  { label: "2:3", value: "2:3", numeric: 2 / 3 },
  { label: "3:2", value: "3:2", numeric: 3 / 2 },
  { label: "3:4", value: "3:4", numeric: 3 / 4 },
  { label: "4:3", value: "4:3", numeric: 4 / 3 },
  { label: "4:5", value: "4:5", numeric: 4 / 5 },
  { label: "5:4", value: "5:4", numeric: 5 / 4 },
  { label: "9:16", value: "9:16", numeric: 9 / 16 },
  { label: "16:9", value: "16:9", numeric: 16 / 9 },
  { label: "21:9", value: "21:9", numeric: 21 / 9 },
  { label: "Original", value: "original", numeric: 0 },
] as const;

const DEFAULT_STATES = [
  "default",
  "happy",
  "sad",
  "angry",
  "running",
  "sleeping",
  "front",
  "back",
  "side",
];

// === Helpers ===

function clampGeometry(field: "x" | "y" | "w" | "h", value: number): number {
  const min = field === "w" || field === "h" ? 1 : 0;
  return Math.max(min, Math.min(100, value));
}

function getImageNaturalDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = url;
  });
}

function findClosestRatio(width: number, height: number): string {
  const ratio = width / height;
  let closest: (typeof COMMON_RATIOS)[number] = COMMON_RATIOS[0];
  let minDiff = Infinity;
  for (const r of COMMON_RATIOS) {
    if (r.value === "original" || r.numeric === 0) continue;
    const diff = Math.abs(r.numeric - ratio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }
  return closest.value;
}

/**
 * Calculate new geometry when ratio changes, preserving approximate area.
 * Keeps center position, adjusts w/h to match target ratio.
 */
function calculateGeometryForRatio(
  geometry: { x: number; y: number; w: number; h: number },
  ratioValue: string
): { x: number; y: number; w: number; h: number } | null {
  if (ratioValue === "original") return null;

  const ratio = COMMON_RATIOS.find((r) => r.value === ratioValue);
  if (!ratio || ratio.numeric === 0) return null;

  // Target ratio is in pixel space; geometry is in % space with canvas aspect ratio
  const targetRatio = ratio.numeric / CANVAS.ASPECT_RATIO;
  const area = geometry.w * geometry.h;
  const newW = Math.sqrt(area * targetRatio);
  const newH = newW / targetRatio;

  const clampedW = clampGeometry("w", newW);
  const clampedH = clampGeometry("h", newH);

  // Re-center around original center
  const centerX = geometry.x + geometry.w / 2;
  const centerY = geometry.y + geometry.h / 2;
  const newX = clampGeometry("x", centerX - clampedW / 2);
  const newY = clampGeometry("y", centerY - clampedH / 2);

  return { x: newX, y: newY, w: clampedW, h: clampedH };
}

// === Component ===

interface ObjectsImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}

export function ObjectsImageToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const {
    item,
    onUpdate,
    onDelete,
    onGenerateImage,
    onSplitImage,
    onCropImage,
    selectedGeometry,
    canvasRef,
  } = context;
  const { geometry } = item;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const currentType = (item.type ?? "raw") as SpreadItemMediaType;
  const currentName = item.name ?? "";
  const currentState = item.state ?? "default";
  const isEntityType = currentType === "character" || currentType === "prop";

  // Detect current aspect ratio from geometry
  const detectedRatio = useMemo(() => {
    if (item.aspect_ratio) return item.aspect_ratio;
    if (geometry.w <= 0 || geometry.h <= 0) return undefined;
    const ratio = (geometry.w / geometry.h) * CANVAS.ASPECT_RATIO;
    const match = COMMON_RATIOS.find(
      (r) => r.numeric > 0 && Math.abs(r.numeric - ratio) < 0.05
    );
    return match?.value;
  }, [item.aspect_ratio, geometry.w, geometry.h]);

  // === Handlers ===

  const handleTypeChange = useCallback(
    (newType: string) => {
      log.debug("ObjectsImageToolbar", "type change", {
        from: currentType,
        to: newType,
      });
      // Reset name & state when type changes to prevent data inconsistency
      onUpdate({
        type: newType as SpreadItemMediaType,
        name: undefined,
        state: undefined,
      });
    },
    [currentType, onUpdate]
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      log.debug("ObjectsImageToolbar", "name change", { name: newName });
      onUpdate({ name: newName });
    },
    [onUpdate]
  );

  const handleStateChange = useCallback(
    (newState: string) => {
      log.debug("ObjectsImageToolbar", "state change", { state: newState });
      onUpdate({ state: newState });
    },
    [onUpdate]
  );

  const handleRatioSelect = useCallback(
    (ratioValue: string) => {
      log.debug("ObjectsImageToolbar", "ratio change", { ratio: ratioValue });
      if (ratioValue === "original") {
        onUpdate({ aspect_ratio: undefined });
        return;
      }
      const newGeometry = calculateGeometryForRatio(geometry, ratioValue);
      if (newGeometry) {
        onUpdate({ geometry: newGeometry, aspect_ratio: ratioValue });
      } else {
        onUpdate({ aspect_ratio: ratioValue });
      }
    },
    [geometry, onUpdate]
  );

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      // Enforce x+w <= 100 and y+h <= 100 to keep items within canvas
      if (field === "x") clamped = Math.min(clamped, 100 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 100 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 100 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 100 - geometry.y);
      log.debug("ObjectsImageToolbar", "geometry change", {
        field,
        value: clamped,
      });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  const handleSplit = useCallback(() => {
    if (onSplitImage) {
      onSplitImage();
    } else {
      toast.info("Split feature not available");
    }
  }, [onSplitImage]);

  const handleCrop = useCallback(() => {
    if (onCropImage) {
      onCropImage();
    } else {
      toast.info("Crop feature not available");
    }
  }, [onCropImage]);

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
      log.info("ObjectsImageToolbar", "upload started", {
        name: file.name,
        size: file.size,
      });

      try {
        const [{ publicUrl }, dimensions] = await Promise.all([
          uploadImageToStorage(file, "objects"),
          getImageNaturalDimensions(file),
        ]);

        const closestRatio = findClosestRatio(dimensions.width, dimensions.height);
        log.debug("ObjectsImageToolbar", "detected upload ratio", {
          natural: `${dimensions.width}x${dimensions.height}`,
          matched: closestRatio,
        });

        // Update media_url + add to illustrations as selected so canvas renders it immediately
        // (EditableImage priority: final_hires > illustrations[selected] > illustrations[0] > media_url)
        const existingIllustrations = (item.illustrations ?? []).map((i) => ({
          ...i,
          is_selected: false,
        }));

        const updates: Parameters<typeof onUpdate>[0] = {
          media_url: publicUrl,
          aspect_ratio: closestRatio,
          illustrations: [
            ...existingIllustrations,
            {
              media_url: publicUrl,
              created_time: new Date().toISOString(),
              is_selected: true,
            },
          ],
        };

        // Adjust geometry to match the new ratio
        const newGeometry = calculateGeometryForRatio(geometry, closestRatio);
        if (newGeometry) {
          updates.geometry = newGeometry;
        }

        onUpdate(updates);
        toast.success("Image uploaded");
        // Close toolbar by deselecting via canvas background click
        canvasRef.current?.click();
        log.info("ObjectsImageToolbar", "upload success", { url: publicUrl, ratio: closestRatio });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("ObjectsImageToolbar", "upload failed", { error: message });
      } finally {
        setIsUploading(false);
      }
    },
    [geometry, onUpdate]
  );

  // === Positioning ===

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
        aria-label="Image formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* === BODY === */}

        {/* Row 1: Image Type */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Type
          </Label>
          <Select value={currentType} onValueChange={handleTypeChange}>
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Image type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Name + State */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Name
          </Label>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* TODO: Replace with entity dropdown (useCharacters/useProps) when store selectors are available */}
            <input
              type="text"
              value={currentName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={
                isEntityType ? `${currentType} name...` : "Enter name..."
              }
              aria-label="Image name"
              className="h-7 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* State dropdown */}
            <Select value={currentState} onValueChange={handleStateChange}>
              <SelectTrigger
                className="h-7 text-sm w-24 shrink-0"
                aria-label="Image state"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: Aspect Ratio */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Ratio
          </Label>
          <Select value={detectedRatio ?? ""} onValueChange={handleRatioSelect}>
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Aspect ratio"
            >
              <SelectValue placeholder="Select ratio..." />
            </SelectTrigger>
            <SelectContent>
              {COMMON_RATIOS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 4-5: Geometry */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">
            Geometry
          </Label>
          <div className="flex flex-col gap-2">
            {/* Position row */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-14">
                Position
              </Label>
              <GeometryInput
                label="X"
                value={geometry.x}
                onChange={(v) => handleGeometryChange("x", v)}
                ariaLabel="Position X"
              />
              <GeometryInput
                label="Y"
                value={geometry.y}
                onChange={(v) => handleGeometryChange("y", v)}
                ariaLabel="Position Y"
              />
            </div>
            {/* Size row */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-14">Size</Label>
              <GeometryInput
                label="W"
                value={geometry.w}
                onChange={(v) => handleGeometryChange("w", v)}
                ariaLabel="Size W"
              />
              <GeometryInput
                label="H"
                value={geometry.h}
                onChange={(v) => handleGeometryChange("h", v)}
                ariaLabel="Size H"
              />
            </div>
          </div>
        </div>

        {/* === FOOTER === */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Scissors}
              label="Split"
              onClick={handleSplit}
            />
            <ToolbarIconButton icon={Crop} label="Crop" onClick={handleCrop} />
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
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete image"
            onClick={onDelete}
            variant="destructive"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}

// === Sub-components (inline, no separate files per design spec) ===

function GeometryInput({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
      <span className="px-2 text-sm text-muted-foreground border-r border-border">
        {label}
      </span>
      <input
        type="text"
        role="spinbutton"
        aria-label={ariaLabel}
        value={Math.round(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
      />
      <span className="px-1.5 text-sm text-muted-foreground border-l border-border">
        %
      </span>
    </div>
  );
}

function ToolbarIconButton({
  icon: Icon,
  label,
  onClick,
  variant,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: "destructive";
  disabled?: boolean;
}) {
  const isDestructive = variant === "destructive";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={
            isDestructive
              ? "p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
              : "p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
          }
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
