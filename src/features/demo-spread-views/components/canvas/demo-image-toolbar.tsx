import { useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Upload, Copy, Trash2, ChevronDown } from "lucide-react";
import { useToolbarPosition, CANVAS, type BaseSpread, type ImageToolbarContext } from "@/features/editor/components/canvas-spread-view";
import { GeometrySection, ToolbarIconButton } from "@/features/editor/components/shared-components";

const COMMON_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
  { label: '21:9', value: 21 / 9 },
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
