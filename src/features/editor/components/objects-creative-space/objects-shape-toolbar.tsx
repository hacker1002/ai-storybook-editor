// objects-shape-toolbar.tsx - Floating toolbar for shape items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import {
  useToolbarPosition,
  type BaseSpread,
  type ShapeToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import {
  clampGeometry,
  GeometrySection,
  ToolbarIconButton,
} from "./shared-toolbar-components";
import type { Geometry } from "@/types/canvas-types";

const log = createLogger("Editor", "ObjectsShapeToolbar");

const OUTLINE_TYPES = [
  { label: "Solid", value: "0" },
  { label: "Dashed", value: "1" },
  { label: "Dotted", value: "2" },
];

interface ObjectsShapeToolbarProps<TSpread extends BaseSpread> {
  context: ShapeToolbarContext<TSpread>;
}

export function ObjectsShapeToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsShapeToolbarProps<TSpread>) {
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

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const geometry = item.geometry;
  const fill = item.fill;
  const outline = item.outline;

  const handleGeometryChange = useCallback(
    (field: keyof Geometry, value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 100 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 100 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 100 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 100 - geometry.y);
      log.debug("ObjectsShapeToolbar", "geometry change", { field, value: clamped });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="shape"
        role="toolbar"
        aria-label="Shape formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Fill Section */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">Fill</Label>
          <div className="flex items-center gap-2">
            <Switch
              checked={fill.is_filled}
              onCheckedChange={(checked) => {
                log.debug("ObjectsShapeToolbar", "fill toggle", { is_filled: checked });
                onUpdateFill({ is_filled: checked });
              }}
              className="scale-75"
            />
            <Label className="text-xs">Filled</Label>
            <input
              type="color"
              value={fill.color}
              onChange={(e) => onUpdateFill({ color: e.target.value })}
              className="w-7 h-7 rounded border cursor-pointer"
              disabled={!fill.is_filled}
              aria-label="Fill color"
            />
            <div className="flex items-center gap-1 flex-1">
              <span className="text-xs text-muted-foreground">Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={fill.opacity}
                onChange={(e) => onUpdateFill({ opacity: parseFloat(e.target.value) })}
                className="w-full h-1"
                aria-label="Fill opacity"
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
              onChange={(e) => onUpdateOutline({ color: e.target.value })}
              className="w-7 h-7 rounded border cursor-pointer"
              aria-label="Outline color"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Width</Label>
              <input
                type="number"
                min="0"
                max="10"
                value={outline.width}
                onChange={(e) => onUpdateOutline({ width: parseInt(e.target.value) || 0 })}
                className="w-12 h-7 rounded-md border border-input bg-transparent px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Outline width"
              />
            </div>
            <Select
              value={String(outline.type)}
              onValueChange={(v) => {
                log.debug("ObjectsShapeToolbar", "outline type change", { type: v });
                onUpdateOutline({ type: parseInt(v) as 0 | 1 | 2 });
              }}
            >
              <SelectTrigger className="h-7 text-xs w-20" aria-label="Outline type">
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
              onChange={(e) => onUpdateOutline({ radius: parseInt(e.target.value) })}
              className="flex-1 h-1"
              aria-label="Border radius"
            />
            <span className="text-xs w-6 text-right">{outline.radius}</span>
          </div>
        </div>

        {/* Geometry Section */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border pt-2">
          <ToolbarIconButton
            icon={Trash2}
            label="Delete shape"
            onClick={onDelete}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
