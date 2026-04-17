import { useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Upload, Copy, Trash2, ChevronDown } from "lucide-react";
import { useToolbarPosition, type BaseSpread, type ImageToolbarContext } from "@/features/editor/components/canvas-spread-view";
import { GeometrySection, ToolbarIconButton } from "@/features/editor/components/shared-components";
import { detectRatioFromGeometry } from "@/utils/aspect-ratio-utils";

// Demo uses fixed 4:3 canvas aspect ratio (800×600 design space)
const DEMO_CANVAS_ASPECT_RATIO = 4 / 3;

function formatAspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '—';
  const match = detectRatioFromGeometry(w, h, DEMO_CANVAS_ASPECT_RATIO);
  if (match) return match;
  return ((w / h) * DEMO_CANVAS_ASPECT_RATIO).toFixed(2);
}

interface DemoImageToolbarProps<TSpread extends BaseSpread> {
  context: ImageToolbarContext<TSpread>;
}

export function DemoImageToolbar<TSpread extends BaseSpread>({
  context,
}: DemoImageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, onUpdate, onDelete, onClone, onGenerateImage, selectedGeometry, canvasRef } = context;
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
    <TooltipProvider delayDuration={300}>
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
        <GeometrySection geometry={geometry} onGeometryChange={handleGeometryChange} />

        {/* Footer */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton icon={Sparkles} label="Generate" onClick={() => onGenerateImage?.()} />
            <ToolbarIconButton icon={Upload} label="Upload" onClick={() => {}} disabled />
            <ToolbarIconButton icon={Copy} label="Clone" onClick={onClone} />
          </div>
          <ToolbarIconButton icon={Trash2} label="Delete" onClick={onDelete} variant="destructive" />
        </div>
      </div>
    </TooltipProvider>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(toolbarContent, document.body);
}
