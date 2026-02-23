import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Trash2,
  Minus,
  Plus,
  Play,
  AudioWaveform,
  Upload,
} from "lucide-react";
import type {
  BaseSpread,
  TextToolbarContext,
  Typography,
  Fill,
  Outline,
  Geometry,
} from "@/components/manuscript-spread-view";
import { useToolbarPosition } from "./use-toolbar-position";

interface DemoTextToolbarProps<TSpread extends BaseSpread> {
  context: TextToolbarContext<TSpread>;
}

const FONT_FAMILIES = [
  "Nunito",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
];

export function DemoTextToolbar<TSpread extends BaseSpread>({
  context,
}: DemoTextToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    item,
    onUpdate,
    onFormatText,
    onDelete,
    onUpdateBackground,
    onUpdateOutline,
    selectedGeometry,
    canvasRef,
  } = context;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  const languageKey = Object.keys(item).find(
    (k) => k !== "id" && k !== "title"
  ) || "en_US";
  const langData = item[languageKey] as {
    text: string;
    geometry: Geometry;
    typography: Typography;
    fill?: Fill;
    outline?: Outline;
  };

  const geometry = langData?.geometry || { x: 0, y: 0, w: 20, h: 10 };
  const typography = langData?.typography || {};
  const fill = langData?.fill || { color: "#ffffff", opacity: 0 };
  const outline = langData?.outline || { color: "#000000", width: 2, radius: 8, type: "solid" as const };

  const [fontSize, setFontSize] = useState(typography.size || 18);
  const [bgOpacity, setBgOpacity] = useState((fill.opacity || 0) * 100);

  const handleFontChange = useCallback(
    (fontFamily: string) => {
      onFormatText?.({ family: fontFamily });
    },
    [onFormatText]
  );

  const handleSizeChange = useCallback(
    (delta: number) => {
      const newSize = Math.max(8, Math.min(72, fontSize + delta));
      setFontSize(newSize);
      onFormatText?.({ size: newSize });
    },
    [fontSize, onFormatText]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      onFormatText?.({ color });
    },
    [onFormatText]
  );

  const handleLineHeightChange = useCallback(
    (value: string) => {
      onFormatText?.({ lineHeight: parseFloat(value) });
    },
    [onFormatText]
  );

  const handleLetterSpacingChange = useCallback(
    (value: string) => {
      onFormatText?.({ letterSpacing: parseFloat(value) });
    },
    [onFormatText]
  );

  const handleOpacityChange = useCallback(
    (delta: number) => {
      const newOpacity = Math.max(0, Math.min(100, bgOpacity + delta));
      setBgOpacity(newOpacity);
      onUpdateBackground?.({ opacity: newOpacity / 100 });
    },
    [bgOpacity, onUpdateBackground]
  );

  const handleBgColorChange = useCallback(
    (color: string) => {
      onUpdateBackground?.({ color });
    },
    [onUpdateBackground]
  );

  const handleOutlineChange = useCallback(
    (field: keyof Outline, delta: number) => {
      const currentValue = outline[field as keyof typeof outline] as number;
      const newValue = Math.max(0, currentValue + delta);
      onUpdateOutline?.({ [field]: newValue } as Partial<Outline>);
    },
    [outline, onUpdateOutline]
  );

  const handleOutlineStyleChange = useCallback(
    (value: string) => {
      onUpdateOutline?.({ type: value as "solid" | "dashed" | "dotted" });
    },
    [onUpdateOutline]
  );

  const handleOutlineColorChange = useCallback(
    (color: string) => {
      onUpdateOutline?.({ color });
    },
    [onUpdateOutline]
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
        [languageKey]: {
          ...langData,
          geometry: { ...geometry, [field]: clampedValue },
        },
      });
    },
    [geometry, langData, languageKey, onUpdate]
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
      className="min-w-[320px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Typography Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select
            onValueChange={handleFontChange}
            defaultValue={typography.family || "Nunito"}
          >
            <SelectTrigger className="h-7 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <button
              onClick={() => handleSizeChange(-1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{fontSize}</span>
            <button
              onClick={() => handleSizeChange(1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center px-2 border border-border rounded-lg bg-secondary h-7">
            <Input
              type="color"
              value={typography.color || "#000000"}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent p-0"
            />
          </div>
        </div>

        <div className="flex gap-1">
          <button className="flex-1 py-2 rounded-lg font-bold transition-colors text-sm bg-secondary hover:bg-muted">
            B
          </button>
          <button className="flex-1 py-2 rounded-lg italic transition-colors text-sm bg-secondary hover:bg-muted">
            I
          </button>
          <button className="flex-1 py-2 rounded-lg underline transition-colors text-sm bg-secondary hover:bg-muted">
            U
          </button>
          <button className="flex-1 py-2 rounded-lg transition-colors bg-secondary hover:bg-muted">
            <Strikethrough className="w-4 h-4 mx-auto" />
          </button>
        </div>

        <div className="flex gap-1">
          <button className="flex-1 py-2 rounded-lg transition-colors bg-primary text-primary-foreground">
            <AlignLeft className="w-4 h-4 mx-auto" />
          </button>
          <button className="flex-1 py-2 rounded-lg transition-colors bg-secondary hover:bg-muted">
            <AlignCenter className="w-4 h-4 mx-auto" />
          </button>
          <button className="flex-1 py-2 rounded-lg transition-colors bg-secondary hover:bg-muted">
            <AlignRight className="w-4 h-4 mx-auto" />
          </button>
          <button className="flex-1 py-2 rounded-lg transition-colors bg-secondary hover:bg-muted">
            <AlignJustify className="w-4 h-4 mx-auto" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-20">Line Height</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="3"
              value={typography.lineHeight || 1.5}
              onChange={(e) => handleLineHeightChange(e.target.value)}
              className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
            />
          </div>
          <Label className="text-xs text-muted-foreground ml-2">Spacing</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <input
              type="number"
              step="0.5"
              min="-5"
              max="20"
              value={typography.letterSpacing || 0}
              onChange={(e) => handleLetterSpacingChange(e.target.value)}
              className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
            />
            <span className="px-1.5 text-sm text-muted-foreground border-l border-border">px</span>
          </div>
        </div>
      </div>

      {/* Background Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Background</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Opacity</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <button
              onClick={() => handleOpacityChange(-5)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-10 text-center text-sm font-medium">{Math.round(bgOpacity)}%</span>
            <button
              onClick={() => handleOpacityChange(5)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <Label className="text-xs text-muted-foreground ml-2">Color</Label>
          <Input
            type="color"
            value={fill.color || "#000000"}
            onChange={(e) => handleBgColorChange(e.target.value)}
            className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent p-1"
          />
        </div>
      </div>

      {/* Outline Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Outline</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Width</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <button
              onClick={() => handleOutlineChange("width", -1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{outline.width}</span>
            <button
              onClick={() => handleOutlineChange("width", 1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-sm text-muted-foreground">px</span>
          <Label className="text-xs text-muted-foreground ml-2">Color</Label>
          <Input
            type="color"
            value={outline.color}
            onChange={(e) => handleOutlineColorChange(e.target.value)}
            className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Radius</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <button
              onClick={() => handleOutlineChange("radius", -1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{outline.radius}</span>
            <button
              onClick={() => handleOutlineChange("radius", 1)}
              className="px-2 hover:bg-muted transition-colors h-full"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-sm text-muted-foreground">px</span>
          <Label className="text-xs text-muted-foreground ml-2">Style</Label>
          <div className="relative flex-1">
            <Select
              onValueChange={handleOutlineStyleChange}
              defaultValue={outline.type}
            >
              <SelectTrigger className="h-7 px-3 pr-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="dotted">Dotted</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                onChange={(e) => handleGeometryChange("x", e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">Y</span>
              <input
                type="text"
                value={Math.round(geometry.y)}
                onChange={(e) => handleGeometryChange("y", e.target.value)}
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
                onChange={(e) => handleGeometryChange("w", e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
            <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
              <span className="px-2 text-sm text-muted-foreground border-r border-border">H</span>
              <input
                type="text"
                value={Math.round(geometry.h)}
                onChange={(e) => handleGeometryChange("h", e.target.value)}
                className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
              />
              <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Narration Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Narration</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg px-2 h-7">
            <button className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors flex-shrink-0">
              <Play className="w-2.5 h-2.5 ml-0.5" />
            </button>
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '0%' }} />
            </div>
            <span className="text-xs text-muted-foreground">0:00</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <button className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">
            <AudioWaveform className="w-4 h-4" />
          </button>
          <button className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">
            <Upload className="w-4 h-4" />
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
