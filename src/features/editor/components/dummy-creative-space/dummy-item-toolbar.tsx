import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Copy, Trash2, Pencil } from "lucide-react";
import {
  useToolbarPosition,
  type BaseSpread,
  type ImageToolbarContext,
  type TextToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import {
  GeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { useCurrentBook } from "@/stores/book-store";
import type {
  DummyImage,
  DummyTextbox,
  DummyTextboxContent,
} from "@/types/dummy";
import {
  FONT_SIZE_CONFIG,
  GEOMETRY_CONFIG,
  DEFAULT_COLOR,
} from "@/types/dummy";
import type { Geometry } from "@/types/spread-types";

type ToolbarContext<TSpread extends BaseSpread> =
  | { type: "image"; context: ImageToolbarContext<TSpread>; item: DummyImage }
  | {
      type: "textbox";
      context: TextToolbarContext<TSpread>;
      item: DummyTextbox;
    };

interface DummyItemToolbarProps<TSpread extends BaseSpread> {
  data: ToolbarContext<TSpread>;
}

function resolveEditCallback(
  data: ToolbarContext<BaseSpread>
): (() => void) | undefined {
  if (data.type === "image") {
    return data.context.onEditArtNote;
  }
  return data.context.onEditText;
}

function getItemData(
  data: ToolbarContext<BaseSpread>,
  originalLangCode: string
) {
  if (data.type === "image") {
    const img = data.item;
    return {
      typography: img.typography ?? {
        size: FONT_SIZE_CONFIG.default,
        color: DEFAULT_COLOR,
      },
      geometry: img.geometry,
      langKey: null,
      langData: null,
    };
  }
  const tb = data.item;
  // Dummy always targets the book's original_language — never the editor language
  // or the textbox's arbitrary first key.
  const langKey = originalLangCode;
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
  const book = useCurrentBook();
  const originalLangCode = book?.original_language ?? "en_US";
  const { context } = data;
  const { onUpdate, onDelete, onClone, selectedGeometry, canvasRef } = context;
  const editCallback = resolveEditCallback(data as ToolbarContext<BaseSpread>);

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });
  const { typography, geometry, langKey, langData } = getItemData(
    data as ToolbarContext<BaseSpread>,
    originalLangCode
  );

  const handleFontSizeChange = useCallback(
    (newSize: number) => {
      // NumberStepper already clamps to its min/max — no extra clamping needed.
      if (data.type === "image") {
        onUpdate?.({
          typography: { size: newSize, color: typography.color },
        } as never);
      } else if (langData && langKey) {
        onUpdate?.({
          [langKey]: {
            ...langData,
            typography: { ...langData.typography, size: newSize },
          },
        } as never);
      }
    },
    [data.type, typography.color, langData, langKey, onUpdate]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (data.type === "image") {
        onUpdate?.({ typography: { size: typography.size, color } } as never);
      } else if (langData && langKey) {
        onUpdate?.({
          [langKey]: {
            ...langData,
            typography: { ...langData.typography, color },
          },
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
        field === "w" || field === "h"
          ? Math.max(1, Math.min(GEOMETRY_CONFIG.max, numValue))
          : Math.max(
              GEOMETRY_CONFIG.min,
              Math.min(GEOMETRY_CONFIG.max, numValue)
            );

      const newGeometry = { ...geometry, [field]: clampedValue };

      if (data.type === "image") {
        onUpdate?.({ geometry: newGeometry } as never);
      } else if (langData && langKey) {
        onUpdate?.({
          [langKey]: { ...langData, geometry: newGeometry },
        } as never);
      }
    },
    [data.type, geometry, langData, langKey, onUpdate]
  );

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar={data.type}
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Typography Section */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">
            Typography
          </Label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14">Size</Label>
            <NumberStepper
              value={typography.size}
              min={FONT_SIZE_CONFIG.min}
              max={FONT_SIZE_CONFIG.max}
              step={FONT_SIZE_CONFIG.step}
              onChange={handleFontSizeChange}
            />
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
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* Footer */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Pencil}
              label="Edit"
              onClick={editCallback}
              disabled={!editCallback}
            />
            <ToolbarIconButton icon={Copy} label="Clone" onClick={onClone} />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete"
            onClick={onDelete}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );

  if (typeof document === "undefined") return null;
  return createPortal(toolbarContent, document.body);
}
