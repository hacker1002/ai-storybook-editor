import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Minus, Plus } from "lucide-react";
import {
  useToolbarPosition,
  type BaseSpread,
  type ShapeToolbarContext,
  type Geometry,
  type ShapeFill,
  type ShapeOutline,
} from "@/components/canvas-spread-view";

interface DemoShapeToolbarProps<TSpread extends BaseSpread> {
  context: ShapeToolbarContext<TSpread>;
}

const OUTLINE_TYPES = [
  { label: "Solid", value: "0" },
  { label: "Dashed", value: "1" },
  { label: "Dotted", value: "2" },
];

export function DemoShapeToolbar<TSpread extends BaseSpread>({
  context,
}: DemoShapeToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    item,
    onUpdate,
    onDelete,
    onUpdateFill,
    onUpdateOutline,
    selectedGeometry,
    canvasRef,
  } = context;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  const geometry = item.geometry || { x: 0, y: 0, w: 20, h: 20 };
  const fill: ShapeFill = item.fill;
  const outline: ShapeOutline = item.outline;

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
      data-toolbar="shape"
      className="min-w-[260px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Fill Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Fill</Label>
        <div className="flex items-center gap-2">
          <Switch
            checked={fill.is_filled}
            onCheckedChange={(checked) => onUpdateFill?.({ is_filled: checked })}
            className="scale-75"
          />
          <Label className="text-xs">Filled</Label>
          <input
            type="color"
            value={fill.color}
            onChange={(e) => onUpdateFill?.({ color: e.target.value })}
            className="w-7 h-7 rounded border cursor-pointer"
            disabled={!fill.is_filled}
          />
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={fill.opacity}
              onChange={(e) => onUpdateFill?.({ opacity: parseFloat(e.target.value) })}
              className="w-full h-1"
            />
          </div>
        </div>
      </div>

      {/* Outline Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Outline</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={outline.color}
            onChange={(e) => onUpdateOutline?.({ color: e.target.value })}
            className="w-7 h-7 rounded border cursor-pointer"
          />
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <span className="px-2 text-xs text-muted-foreground border-r border-border">W</span>
            <button
              onClick={() => onUpdateOutline?.({ width: Math.max(0, outline.width - 1) })}
              className="px-1 hover:bg-muted transition-colors h-full"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-xs">{outline.width}</span>
            <button
              onClick={() => onUpdateOutline?.({ width: Math.min(10, outline.width + 1) })}
              className="px-1 hover:bg-muted transition-colors h-full"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <Select
            value={String(outline.type)}
            onValueChange={(v) => onUpdateOutline?.({ type: parseInt(v) as 0 | 1 | 2 })}
          >
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTLINE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-12">Radius</Label>
          <input
            type="range"
            min="0"
            max="50"
            value={outline.radius}
            onChange={(e) => onUpdateOutline?.({ radius: parseInt(e.target.value) })}
            className="flex-1 h-1"
          />
          <span className="text-xs w-6 text-right">{outline.radius}</span>
        </div>
      </div>

      {/* Geometry Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Geometry</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Position</Label>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-xs text-muted-foreground border-r border-border">X</span>
              <button
                onClick={() => handleGeometryAdjust("x", -1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.x)}
                onChange={(e) => handleGeometryChange("x", e.target.value)}
                className="w-8 bg-transparent px-1 text-xs text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("x", 1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1 text-xs text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-xs text-muted-foreground border-r border-border">Y</span>
              <button
                onClick={() => handleGeometryAdjust("y", -1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.y)}
                onChange={(e) => handleGeometryChange("y", e.target.value)}
                className="w-8 bg-transparent px-1 text-xs text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("y", 1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1 text-xs text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Size</Label>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-xs text-muted-foreground border-r border-border">W</span>
              <button
                onClick={() => handleGeometryAdjust("w", -1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.w)}
                onChange={(e) => handleGeometryChange("w", e.target.value)}
                className="w-8 bg-transparent px-1 text-xs text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("w", 1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1 text-xs text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-xs text-muted-foreground border-r border-border">H</span>
              <button
                onClick={() => handleGeometryAdjust("h", -1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="text"
                value={Math.round(geometry.h)}
                onChange={(e) => handleGeometryChange("h", e.target.value)}
                className="w-8 bg-transparent px-1 text-xs text-center focus:outline-none"
              />
              <button
                onClick={() => handleGeometryAdjust("h", 1)}
                className="px-1 hover:bg-muted transition-colors h-full"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="px-1 text-xs text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end border-t border-border pt-2">
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
