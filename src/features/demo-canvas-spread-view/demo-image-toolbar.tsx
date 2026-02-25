import { useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Sparkles, Upload, Copy, Trash2, ChevronDown } from "lucide-react";
import { useToolbarPosition, CANVAS, type BaseSpread, type ImageToolbarContext } from "@/components/canvas-spread-view";

const COMMON_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
] as const;

function formatAspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '—';

  const ratio = (w / h) * CANVAS.ASPECT_RATIO;
  const match = COMMON_RATIOS.find(r => Math.abs(r.value - ratio) < 0.05);

  if (match) return match.label;
  return ratio.toFixed(2);
}

interface DemoImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}


export function DemoImageToolbar<TSpread extends BaseSpread>({
  context,
}: DemoImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, onUpdate, onDelete, onClone, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });
  const aspectRatioLabel = useMemo(() => formatAspectRatio(geometry.w, geometry.h), [geometry.w, geometry.h]);

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

  const toolbarStyle: React.CSSProperties = position ? {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
  } : {
    position: 'fixed',
    opacity: 0,
    pointerEvents: 'none',
  };

  const toolbarContent = (
    <div
      ref={toolbarRef}
      data-toolbar="image"
      className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Aspect Ratio Section - Fixed, not editable */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
        <div className="flex items-center h-7 px-3 border border-border rounded-lg bg-muted/50 text-muted-foreground cursor-not-allowed">
          <span className="text-sm">{aspectRatioLabel}</span>
          <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
        </div>
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
