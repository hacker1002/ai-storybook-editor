"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { X, Check } from "lucide-react";
import { ImageZoomPreview } from "@/components/ui/image-zoom-preview";

// === Shared Types & Constants ===

export type AspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9";
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export interface CropBoundingBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  aspectRatio: AspectRatio;
}

export interface CropResults {
  cropped: Array<{
    boxIndex: number;
    base64: string;
    mimeType: "image/png";
    aspectRatio: string;
  }>;
}

export interface CropCreateResult {
  croppedObjects: Array<{
    imageUrl: string;
    boxIndex: number;
    aspectRatio: string;
    geometry: { x: number; y: number; w: number; h: number };
  }>;
}

export const BOX_COLORS = ["#2196F3", "#4CAF50", "#FF9800"] as const;
export const MAX_BOXES = 3;
export const DEFAULT_BOX_SIZE_PERCENT = 30;
export const MIN_BOX_SIZE_PERCENT = 2;

export const ASPECT_RATIOS: {
  label: string;
  value: AspectRatio;
  numeric: number;
}[] = [
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
];

// === Helpers ===

export function parseRatioNumeric(ratio: AspectRatio): number {
  return ASPECT_RATIOS.find((r) => r.value === ratio)?.numeric ?? 1;
}

export function getPercentRatio(
  ratio: AspectRatio,
  naturalW: number,
  naturalH: number
): number {
  return parseRatioNumeric(ratio) * (naturalH / naturalW);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Convert base64 string to a File object for upload */
export function base64ToFile(base64: string, filename: string): File {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new File([bytes], filename, { type: "image/png" });
}

// === Sub-Components ===

const CORNER_POSITIONS: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: -4, left: -4, cursor: "nw-resize" },
  ne: { top: -4, right: -4, cursor: "ne-resize" },
  sw: { bottom: -4, left: -4, cursor: "sw-resize" },
  se: { bottom: -4, right: -4, cursor: "se-resize" },
};

export function BoundingBoxOverlay({
  box,
  index,
  color,
  isSelected,
  isLocked,
  onPointerDown,
  onSelect,
  onDelete,
  onRatioChange,
}: {
  box: CropBoundingBox;
  index: number;
  color: string;
  isSelected: boolean;
  isLocked: boolean;
  onPointerDown: (
    e: React.MouseEvent,
    type: "drag" | "resize",
    corner?: ResizeCorner
  ) => void;
  onSelect: () => void;
  onDelete: () => void;
  onRatioChange: (ratio: AspectRatio) => void;
}) {
  return (
    <div
      className="absolute group"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: isSelected ? 20 : 10,
        cursor: isLocked ? "default" : "move",
      }}
      onMouseDown={(e) => {
        onSelect();
        if (!isLocked) onPointerDown(e, "drag");
      }}
    >
      {/* Dashed border */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ border: `2px dashed ${color}` }}
      />

      {/* Controls above box: ratio selector + delete */}
      <div
        className="absolute flex items-center gap-1"
        style={{
          top: -28,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Select
          value={box.aspectRatio}
          onValueChange={(v) => onRatioChange(v as AspectRatio)}
          disabled={isLocked}
        >
          <SelectTrigger
            className="h-6 text-xs px-2 min-w-0 w-auto bg-background"
            style={{ borderColor: color, fontSize: 11 }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_RATIOS.map((r) => (
              <SelectItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors ${
            isSelected ? "visible" : "invisible group-hover:visible"
          }`}
          aria-label={`Remove crop area ${index + 1}`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Corner resize handles */}
      {isSelected &&
        !isLocked &&
        (["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
          <div
            key={corner}
            className="absolute"
            style={{
              ...CORNER_POSITIONS[corner],
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "white",
              border: `2px solid ${color}`,
              zIndex: 25,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, "resize", corner);
            }}
          />
        ))}
    </div>
  );
}

export function CropResultSection({
  results,
  selectedIndices,
  onToggleSelect,
}: {
  results: CropResults;
  selectedIndices: Set<number>;
  onToggleSelect: (boxIndex: number) => void;
}) {
  const selectedCount = selectedIndices.size;

  return (
    <div className="space-y-3">
      {results.cropped.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Cropped Objects</p>
            <span className="text-xs text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>
          <div
            className="grid grid-cols-3 gap-3"
            role="group"
            aria-label="Cropped objects"
          >
            {results.cropped.map((obj) => {
              const isSelected = selectedIndices.has(obj.boxIndex);
              const dataUrl = `data:image/png;base64,${obj.base64}`;
              return (
                <div
                  key={obj.boxIndex}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                    isSelected
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="relative">
                    <img
                      src={dataUrl}
                      alt={`Cropped #${obj.boxIndex + 1}`}
                      className="w-full aspect-square object-contain bg-muted"
                    />
                    <ImageZoomPreview
                      src={dataUrl}
                      alt={`Cropped #${obj.boxIndex + 1}`}
                      className="absolute inset-0 w-full h-full"
                    />
                    <button
                      onClick={() => onToggleSelect(obj.boxIndex)}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select cropped #${obj.boxIndex + 1}`}
                      className="absolute top-1.5 right-1.5 z-20 cursor-pointer"
                    >
                      <div
                        className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-colors shadow-md ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "bg-white/90 border-muted-foreground/40 hover:border-primary/60"
                        }`}
                      >
                        {isSelected && (
                          <Check className="h-5 w-5 text-primary-foreground" />
                        )}
                      </div>
                    </button>
                  </div>
                  <div className="px-2 py-1.5 text-xs text-center truncate bg-background">
                    Cropped #{obj.boxIndex + 1} ({obj.aspectRatio})
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
