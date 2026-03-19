"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { X } from "lucide-react";
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
export type CropStep = "idle" | "cropping" | "inpainting";
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
  cropped: Array<{ boxIndex: number; imageUrl: string; aspectRatio: string }>;
  croppedBackground?: { imageUrl: string };
  inpainted?: { imageUrl: string };
}

export interface CropReplaceResult {
  croppedObjects: Array<{
    imageUrl: string;
    boxIndex: number;
    aspectRatio: string;
    geometry: { x: number; y: number; w: number; h: number };
  }>;
  inpaintedImageUrl?: string;
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

export const INPAINT_PROMPT = `Vẽ lại ảnh nền (chỉ background) trên ảnh gốc đã bị crop các đối tượng chính dưới đây.
  Tham khảo ảnh các vùng bị crop (xem các ảnh tham khảo). Lưu ý chỉ fill background, không vẽ lại đối tượng chính của vùng bị crop`;

export function findClosestAspectRatio(width: number, height: number): AspectRatio {
  const actual = width / height;
  let closest = ASPECT_RATIOS[0];
  let minDiff = Math.abs(actual - closest.numeric);
  for (const r of ASPECT_RATIOS) {
    const diff = Math.abs(actual - r.numeric);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }
  return closest.value;
}

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
  boxColors,
}: {
  results: CropResults;
  boxColors: readonly string[];
}) {
  const bgSrc =
    results.inpainted?.imageUrl ?? results.croppedBackground?.imageUrl;

  return (
    <div className="space-y-3">
      {results.cropped.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Cropped Objects</p>
          <div className="grid grid-cols-3 gap-3">
            {results.cropped.map((obj) => (
              <div
                key={obj.boxIndex}
                className="rounded-lg overflow-hidden"
                style={{
                  border: `2px solid ${boxColors[obj.boxIndex] ?? "#999"}`,
                }}
              >
                <div className="relative">
                  <img
                    src={obj.imageUrl}
                    alt={`Cropped #${obj.boxIndex + 1}`}
                    className="w-full aspect-square object-contain bg-muted"
                  />
                  <ImageZoomPreview
                    src={obj.imageUrl}
                    alt={`Cropped #${obj.boxIndex + 1}`}
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <div className="px-2 py-1 text-xs text-center truncate bg-background">
                  Cropped #{obj.boxIndex + 1} ({obj.aspectRatio})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bgSrc && (
        <div>
          <p className="text-sm font-semibold mb-2">
            {results.inpainted ? "Inpainted Image" : "Background (raw)"}
          </p>
          <div className="relative rounded-lg overflow-hidden border border-border">
            <img
              src={bgSrc}
              alt={results.inpainted ? "Inpainted image" : "Cropped background"}
              className="w-full object-contain bg-muted"
            />
            <ImageZoomPreview
              src={bgSrc}
              alt={results.inpainted ? "Inpainted image" : "Cropped background"}
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
