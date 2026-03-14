import { useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Label } from '@/components/ui/label';
import { Copy, Trash2, Minus, Plus } from 'lucide-react';
import {
  useToolbarPosition,
  type BaseSpread,
  type ImageToolbarContext,
  type TextToolbarContext,
} from '@/features/editor/components/canvas-spread-view';
import type { DummyImage, DummyTextbox, DummyTextboxContent } from '@/types/dummy';
import { FONT_SIZE_CONFIG, GEOMETRY_CONFIG, DEFAULT_COLOR, getFirstTextboxKey } from '@/types/dummy';
import type { Geometry } from '@/types/spread-types';

type ToolbarContext<TSpread extends BaseSpread> =
  | { type: 'image'; context: ImageToolbarContext<TSpread>; item: DummyImage }
  | { type: 'text'; context: TextToolbarContext<TSpread>; item: DummyTextbox };

interface DummyItemToolbarProps<TSpread extends BaseSpread> {
  data: ToolbarContext<TSpread>;
}

function getItemData(data: ToolbarContext<BaseSpread>) {
  if (data.type === 'image') {
    const img = data.item;
    return {
      typography: img.typography ?? { size: FONT_SIZE_CONFIG.default, color: DEFAULT_COLOR },
      geometry: img.geometry,
      langKey: null,
      langData: null,
    };
  }
  const tb = data.item;
  const langKey = getFirstTextboxKey(tb) || 'en_US';
  const langData = tb[langKey] as DummyTextboxContent | undefined;
  return {
    typography: {
      size: langData?.typography?.size ?? FONT_SIZE_CONFIG.default,
      color: langData?.typography?.color ?? DEFAULT_COLOR,
    },
    geometry: langData?.geometry ?? { x: 0, y: 0, w: 20, h: 10 },
    langKey,
    langData,
  };
}

export function DummyItemToolbar<TSpread extends BaseSpread>({
  data,
}: DummyItemToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { context } = data;
  const { onUpdate, onDelete, onClone, selectedGeometry, canvasRef } = context;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });
  const { typography, geometry, langKey, langData } = getItemData(data as ToolbarContext<BaseSpread>);

  const handleFontSizeChange = useCallback(
    (delta: number) => {
      const newSize = Math.max(
        FONT_SIZE_CONFIG.min,
        Math.min(FONT_SIZE_CONFIG.max, typography.size + delta)
      );

      if (data.type === 'image') {
        // DummyImage has its own typography shape — cast for compatibility
        onUpdate?.({ typography: { size: newSize, color: typography.color } } as never);
      } else if (langData && langKey) {
        onUpdate?.({
          [langKey]: { ...langData, typography: { ...langData.typography, size: newSize } },
        } as never);
      }
    },
    [data.type, typography, langData, langKey, onUpdate]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (data.type === 'image') {
        onUpdate?.({ typography: { size: typography.size, color } } as never);
      } else if (langData && langKey) {
        onUpdate?.({
          [langKey]: { ...langData, typography: { ...langData.typography, color } },
        } as never);
      }
    },
    [data.type, typography.size, langData, langKey, onUpdate]
  );

  const handleGeometryChange = useCallback(
    (field: keyof Geometry, value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const clampedValue =
        field === 'w' || field === 'h'
          ? Math.max(1, Math.min(GEOMETRY_CONFIG.max, numValue))
          : Math.max(GEOMETRY_CONFIG.min, Math.min(GEOMETRY_CONFIG.max, numValue));

      const newGeometry = { ...geometry, [field]: clampedValue };

      if (data.type === 'image') {
        onUpdate?.({ geometry: newGeometry } as never);
      } else if (langData && langKey) {
        onUpdate?.({ [langKey]: { ...langData, geometry: newGeometry } } as never);
      }
    },
    [data.type, geometry, langData, langKey, onUpdate]
  );

  const toolbarStyle: React.CSSProperties = position
    ? { position: 'fixed', top: `${position.top}px`, left: `${position.left}px` }
    : { position: 'fixed', opacity: 0, pointerEvents: 'none' };

  const toolbarContent = (
    <div
      ref={toolbarRef}
      data-toolbar={data.type}
      className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
    >
      {/* Typography Section */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase">Typography</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Size</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <button
              onClick={() => handleFontSizeChange(-FONT_SIZE_CONFIG.step)}
              disabled={typography.size <= FONT_SIZE_CONFIG.min}
              className="px-2 hover:bg-muted transition-colors h-full disabled:opacity-50"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{typography.size}</span>
            <button
              onClick={() => handleFontSizeChange(FONT_SIZE_CONFIG.step)}
              disabled={typography.size >= FONT_SIZE_CONFIG.max}
              className="px-2 hover:bg-muted transition-colors h-full disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <Label className="text-xs text-muted-foreground ml-2">Color</Label>
          <input
            type="color"
            value={typography.color}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent p-1"
          />
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
        <button
          onClick={onClone}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(toolbarContent, document.body);
}
