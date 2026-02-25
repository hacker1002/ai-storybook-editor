import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scissors,
  Crop,
  Sparkles,
  RotateCw,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";
import {
  useToolbarPosition,
  type BaseSpread,
  type SpreadObject,
  type ObjectToolbarContext,
  type Geometry,
} from "@/components/canvas-spread-view";

interface DemoObjectToolbarProps<TSpread extends BaseSpread> {
  context: ObjectToolbarContext<TSpread>;
}

const OBJECT_TYPES = [
  "character",
  "prop",
  "background",
  "foreground",
  "raw",
  "other",
] as const;

const ASPECT_RATIOS = [
  { label: "Free", value: "free" },
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "2:3", value: "2:3" },
  { label: "3:2", value: "3:2" },
];

const MOCK_NAMES = ["main_character", "side_character", "prop_1", "background_1"];

const MOCK_STATES: Record<string, string[]> = {
  main_character: ["default", "happy", "sad"],
  side_character: ["default", "talking"],
  prop_1: ["default"],
  background_1: ["day", "night"],
};

export function DemoObjectToolbar<TSpread extends BaseSpread>({
  context,
}: DemoObjectToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    item,
    onUpdate,
    onDelete,
    selectedGeometry,
    canvasRef,
    onRotate,
    onCut,
    onCrop,
    onGenerate,
  } = context;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  const geometry = item.geometry || { x: 0, y: 0, w: 20, h: 20 };
  const aspectRatio = item.aspect_ratio || "free";

  const handleTypeChange = useCallback(
    (type: string) => {
      onUpdate?.({ type: type as SpreadObject["type"] });
    },
    [onUpdate]
  );

  const handleNameChange = useCallback(
    (name: string) => {
      onUpdate?.({ name });
    },
    [onUpdate]
  );

  const handleStateChange = useCallback(
    (state: string) => {
      onUpdate?.({ state });
    },
    [onUpdate]
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      // Parse aspect ratio to numeric value
      const parseRatio = (ratio: string): number | null => {
        if (ratio === 'free') return null;
        const [w, h] = ratio.split(':').map(Number);
        return w && h ? w / h : null;
      };

      const targetAspect = parseRatio(value);

      if (targetAspect) {
        // Adjust geometry to match new aspect ratio (keep width, adjust height)
        const newHeight = geometry.w / targetAspect;
        const clampedHeight = Math.max(1, Math.min(100 - geometry.y, newHeight));

        onUpdate?.({
          aspect_ratio: value as SpreadObject["aspect_ratio"],
          geometry: { ...geometry, h: clampedHeight },
        });
      } else {
        // Free ratio - just update the aspect_ratio field
        onUpdate?.({ aspect_ratio: value as SpreadObject["aspect_ratio"] });
      }
    },
    [onUpdate, geometry]
  );

  const handleGeometryChange = useCallback(
    (field: keyof Geometry, value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const clampedValue =
        field === "w" || field === "h"
          ? Math.max(1, Math.min(100, numValue))
          : Math.max(0, Math.min(100, numValue));

      onUpdate?.({
        geometry: { ...geometry, [field]: clampedValue },
      });
    },
    [geometry, onUpdate]
  );

  const handleGeometryAdjust = useCallback(
    (field: keyof Geometry, delta: number) => {
      const currentValue = geometry[field];
      const newValue =
        field === "w" || field === "h"
          ? Math.max(1, Math.min(100, currentValue + delta))
          : Math.max(0, Math.min(100, currentValue + delta));

      onUpdate?.({
        geometry: { ...geometry, [field]: newValue },
      });
    },
    [geometry, onUpdate]
  );

  const availableStates = item.name ? MOCK_STATES[item.name] || ["default"] : ["default"];

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : {
        position: "fixed",
        opacity: 0,
        pointerEvents: "none",
      };

  const toolbarContent = (
    <div
      ref={toolbarRef}
      data-toolbar="object"
      className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Type Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Type</Label>
        <Select onValueChange={handleTypeChange} value={item.type}>
          <SelectTrigger className="h-7 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OBJECT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Name Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Name</Label>
        <div className="flex items-center gap-2">
          <Select onValueChange={handleNameChange} value={item.name || ""}>
            <SelectTrigger className="h-7 text-sm flex-1">
              <SelectValue placeholder="Select name" />
            </SelectTrigger>
            <SelectContent>
              {MOCK_NAMES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={handleStateChange}
            value={item.state || "default"}
            disabled={!item.name}
          >
            <SelectTrigger className="h-7 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ratio Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Aspect Ratio</Label>
        <Select onValueChange={handleAspectRatioChange} value={aspectRatio}>
          <SelectTrigger className="h-7 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_RATIOS.map((ratio) => (
              <SelectItem key={ratio.value} value={ratio.value}>
                {ratio.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Geometry Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Geometry</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Position</Label>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">X</span>
              <button
                onClick={() => handleGeometryAdjust("x", -1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.x)}
                onChange={(e) => handleGeometryChange("x", e.target.value)}
                className="w-10 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("x", 1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">Y</span>
              <button
                onClick={() => handleGeometryAdjust("y", -1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.y)}
                onChange={(e) => handleGeometryChange("y", e.target.value)}
                className="w-10 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("y", 1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Size</Label>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">W</span>
              <button
                onClick={() => handleGeometryAdjust("w", -1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.w)}
                onChange={(e) => handleGeometryChange("w", e.target.value)}
                className="w-10 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("w", 1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">H</span>
              <button
                onClick={() => handleGeometryAdjust("h", -1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.h)}
                onChange={(e) => handleGeometryChange("h", e.target.value)}
                className="w-10 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("h", 1)}
                className="px-1.5 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onCut}
            disabled={!onCut}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cut"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button
            onClick={onCrop}
            disabled={!onCrop}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Crop"
          >
            <Crop className="w-4 h-4" />
          </button>
          <button
            onClick={onGenerate}
            disabled={!onGenerate}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={onRotate}
            disabled={!onRotate}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(toolbarContent, document.body);
}
