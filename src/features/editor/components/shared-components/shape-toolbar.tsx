// shape-toolbar.tsx - Shared floating toolbar for shape items, used by both Objects and Spreads creative spaces
"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Copy, Trash2 } from "lucide-react";
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
} from "@/features/editor/components/shared-components/shared-toolbar-components";
import type { Geometry } from "@/types/canvas-types";

const log = createLogger("Editor", "ShapeToolbar");

const FILL_TYPE_OPTIONS = [
  { label: "Solid", value: "solid" },
  { label: "None", value: "none" },
] as const;

const OUTLINE_TYPE_OPTIONS = [
  { label: "Solid", value: "0" },
  { label: "Dashed", value: "1" },
  { label: "Dotted", value: "2" },
] as const;

interface ShapeToolbarProps<TSpread extends BaseSpread> {
  context: ShapeToolbarContext<TSpread>;
}

export function ShapeToolbar<TSpread extends BaseSpread>({
  context,
}: ShapeToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    item,
    onUpdate,
    onDelete,
    onClone,
    onUpdateFill,
    onUpdateOutline,
    selectedGeometry,
    canvasRef,
  } = context;

  const geometry = item.geometry;
  const fill = item.fill;
  const outline = item.outline;

  const fillColor = fill.color ?? "#000000";
  const fillOpacity = fill.opacity ?? 1;
  const outlineColor = outline.color ?? "#000000";
  const outlineWidth = outline.width ?? 2;
  const outlineRadius = outline.radius ?? 0;

  const [localFillHex, setLocalFillHex] = useState(fillColor.toUpperCase());
  const [localOutlineHex, setLocalOutlineHex] = useState(outlineColor.toUpperCase());

  const handleFillTypeChange = useCallback(
    (type: string) => {
      log.debug("ShapeToolbar", "fill type change", { type });
      onUpdateFill({ is_filled: type === "solid" });
    },
    [onUpdateFill]
  );

  const handleFillColorChange = useCallback(
    (color: string) => {
      setLocalFillHex(color.toUpperCase());
      onUpdateFill({ color });
    },
    [onUpdateFill]
  );

  const handleFillOpacityChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      onUpdateFill({ opacity: Math.max(0, Math.min(1, parsed)) });
    },
    [onUpdateFill]
  );

  const handleOutlineColorChange = useCallback(
    (color: string) => {
      setLocalOutlineHex(color.toUpperCase());
      onUpdateOutline({ color });
    },
    [onUpdateOutline]
  );

  const handleOutlineWidthChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      onUpdateOutline({ width: Math.max(0, Math.min(10, parsed)) });
    },
    [onUpdateOutline]
  );

  const handleOutlineRadiusChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      onUpdateOutline({ radius: Math.max(0, Math.min(50, parsed)) });
    },
    [onUpdateOutline]
  );

  const handleGeometryChange = useCallback(
    (field: keyof Geometry, value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 100 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 100 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 100 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 100 - geometry.y);
      log.debug("ShapeToolbar", "geometry change", { field, value: clamped });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const fillType = fill.is_filled ? "solid" : "none";
  const isFilled = fillType === "solid";

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
            <Label className="text-xs text-muted-foreground w-[50px] shrink-0">Type</Label>
            <Select value={fillType} onValueChange={handleFillTypeChange}>
              <SelectTrigger className="h-7 text-xs flex-1" aria-label="Fill type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILL_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isFilled && (
              <>
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => handleFillColorChange(e.target.value)}
                  className="w-7 h-7 rounded border cursor-pointer"
                  aria-label="Fill color"
                />
                <input
                  type="text"
                  value={localFillHex}
                  onChange={(e) => setLocalFillHex(e.target.value.toUpperCase())}
                  onBlur={(e) => {
                    const hex = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                      handleFillColorChange(hex);
                    } else {
                      setLocalFillHex(fillColor.toUpperCase());
                    }
                  }}
                  className="w-20 h-7 rounded-md border border-input bg-transparent px-2 text-xs font-mono text-center uppercase"
                  aria-label="Fill color hex"
                />
              </>
            )}
          </div>

          {isFilled && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-[50px] shrink-0">Opacity</Label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={fillOpacity}
                onChange={(e) => handleFillOpacityChange(e.target.value)}
                className="flex-1 h-1"
                aria-label="Fill opacity"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(fillOpacity * 100)}
                onChange={(e) => handleFillOpacityChange(String(Number(e.target.value) / 100))}
                className="w-14 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Fill opacity percent"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
        </div>

        {/* Outline Section */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">Outline</Label>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-[50px] shrink-0">Type</Label>
            <Select
              value={String(outline.type ?? 0)}
              onValueChange={(v) => {
                log.debug("ShapeToolbar", "outline type change", { type: v });
                onUpdateOutline({ type: parseInt(v) as 0 | 1 | 2 });
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1" aria-label="Outline type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTLINE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="color"
              value={outlineColor}
              onChange={(e) => handleOutlineColorChange(e.target.value)}
              className="w-7 h-7 rounded border cursor-pointer"
              aria-label="Outline color"
            />
            <input
              type="text"
              value={localOutlineHex}
              onChange={(e) => setLocalOutlineHex(e.target.value.toUpperCase())}
              onBlur={(e) => {
                const hex = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                  handleOutlineColorChange(hex);
                } else {
                  setLocalOutlineHex(outlineColor.toUpperCase());
                }
              }}
              className="w-20 h-7 rounded-md border border-input bg-transparent px-2 text-xs font-mono text-center uppercase"
              aria-label="Outline color hex"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-[50px] shrink-0">Width</Label>
            <input
              type="number"
              min="0"
              max="10"
              value={outlineWidth}
              onChange={(e) => handleOutlineWidthChange(e.target.value)}
              className="w-14 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Outline width"
            />
            <span className="text-xs text-muted-foreground">px</span>

            <Label className="text-xs text-muted-foreground w-[50px] shrink-0 ml-2">Radius</Label>
            <input
              type="number"
              min="0"
              max="50"
              value={outlineRadius}
              onChange={(e) => handleOutlineRadiusChange(e.target.value)}
              className="w-14 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Outline radius"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>

        {/* Geometry Section */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <div>
            {onClone && (
              <ToolbarIconButton
                icon={Copy}
                label="Clone shape"
                onClick={onClone}
              />
            )}
          </div>
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
