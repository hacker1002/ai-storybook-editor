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
import { Sparkles, Upload, Copy, Trash2 } from "lucide-react";
import type { BaseSpread, ImageToolbarContext } from "@/components/manuscript-spread-view";
import { useToolbarPosition } from "./use-toolbar-position";

interface DemoImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}

const ASPECT_RATIOS = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
};

export function DemoImageToolbar<TSpread extends BaseSpread>({
  context,
}: DemoImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, onUpdate, onDelete, onClone, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  const handleGeometryChange = useCallback(
    (field: 'x' | 'y' | 'w' | 'h', value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const clampedValue = field === 'w' || field === 'h'
        ? Math.max(1, Math.min(100, numValue))
        : Math.max(0, Math.min(100, numValue));

      onUpdate?.({
        geometry: { ...geometry, [field]: clampedValue }
      });
    },
    [geometry, onUpdate]
  );

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      if (ratio === 'custom') return;
      const aspectRatio = ASPECT_RATIOS[ratio as keyof typeof ASPECT_RATIOS];
      const newHeight = geometry.w / aspectRatio;
      onUpdate?.({
        geometry: { ...geometry, h: Math.min(100, newHeight) }
      });
    },
    [geometry, onUpdate]
  );

  const toolbarStyle: React.CSSProperties = position ? {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
    zIndex: 10001,
  } : {
    position: 'fixed',
    opacity: 0,
    pointerEvents: 'none',
    zIndex: 10001,
  };

  const toolbarContent = (
    <div
      ref={toolbarRef}
      className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Aspect Ratio Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
        <Select onValueChange={handleAspectRatioChange} defaultValue="custom">
          <SelectTrigger className="h-7 text-sm">
            <SelectValue placeholder="Select ratio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1:1">1:1</SelectItem>
            <SelectItem value="4:3">4:3</SelectItem>
            <SelectItem value="16:9">16:9</SelectItem>
            <SelectItem value="3:2">3:2</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
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
              <input
                type="text"
                value={Math.round(geometry.x)}
                onChange={(e) => handleGeometryChange('x', e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">Y</span>
              <input
                type="text"
                value={Math.round(geometry.y)}
                onChange={(e) => handleGeometryChange('y', e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Size</Label>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">W</span>
              <input
                type="text"
                value={Math.round(geometry.w)}
                onChange={(e) => handleGeometryChange('w', e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">H</span>
              <input
                type="text"
                value={Math.round(geometry.h)}
                onChange={(e) => handleGeometryChange('h', e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <button disabled className="p-1 text-muted-foreground/50 rounded cursor-not-allowed">
            <Sparkles className="w-4 h-4" />
          </button>
          <button disabled className="p-1 text-muted-foreground/50 rounded cursor-not-allowed">
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={onClone}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // Render toolbar to document.body via portal to avoid z-index stacking issues
  if (typeof document === 'undefined') return null;
  return createPortal(toolbarContent, document.body);
}
