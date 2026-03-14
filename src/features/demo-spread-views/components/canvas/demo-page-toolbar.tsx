// demo-page-toolbar.tsx - Page background toolbar for spread editor demo
import { useRef, useState, useEffect, useCallback } from "react";
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
import { Lock } from "lucide-react";
import type {
  BaseSpread,
  PageToolbarContext,
  TextureOption,
} from "@/components/canvas-spread-view";

const LAYOUT_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "full-bleed", label: "Full Bleed" },
  { id: "centered", label: "Centered" },
  { id: "top-heavy", label: "Top Heavy" },
  { id: "bottom-heavy", label: "Bottom Heavy" },
  { id: "split-horizontal", label: "Split Horizontal" },
  { id: "split-vertical", label: "Split Vertical" },
  { id: "corner-accent", label: "Corner Accent" },
] as const;

// Match TextureOption type: 'paper' | 'canvas' | 'linen' | 'watercolor' | null
const TEXTURE_OPTIONS: { id: TextureOption; label: string }[] = [
  { id: null, label: "None" },
  { id: "paper", label: "Paper" },
  { id: "canvas", label: "Canvas" },
  { id: "linen", label: "Linen" },
  { id: "watercolor", label: "Watercolor" },
];

interface DemoPageToolbarProps<TSpread extends BaseSpread> {
  context: PageToolbarContext<TSpread>;
}

export function DemoPageToolbar<TSpread extends BaseSpread>({
  context,
}: DemoPageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const {
    page,
    pageIndex,
    position: pagePosition,
    isLayoutLocked,
    onUpdateLayout,
    onUpdateColor,
    onUpdateTexture,
  } = context;

  // Calculate toolbar position based on page element
  useEffect(() => {
    const pageEl = document.querySelector(`[data-page-index="${pageIndex}"]`);
    if (!pageEl || !toolbarRef.current) return;

    const updatePosition = () => {
      const pageRect = pageEl.getBoundingClientRect();
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      if (!toolbarRect) return;

      const GAP = 8;
      let top = pageRect.top - toolbarRect.height - GAP;
      let left = pageRect.left + (pageRect.width - toolbarRect.width) / 2;

      // Boundary handling: if not enough space above, show below
      if (top < GAP) {
        top = pageRect.bottom + GAP;
      }

      // Keep within viewport horizontally
      const viewportWidth = window.innerWidth;
      left = Math.max(
        GAP,
        Math.min(left, viewportWidth - toolbarRect.width - GAP)
      );

      setPosition({ top, left });
    };

    // Initial position
    const rafId = requestAnimationFrame(updatePosition);

    // Update on scroll/resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [pageIndex]);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateColor(e.target.value);
    },
    [onUpdateColor]
  );

  const currentLayout = page.layout || "default";
  const currentTexture = page.background.texture;
  const currentColor = page.background.color;

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
      data-toolbar="page"
      className="min-w-[260px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
      style={toolbarStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Layout Dropdown */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-16">Layout</Label>
        {isLayoutLocked ? (
          <div className="flex-1 flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/50 text-muted-foreground cursor-not-allowed">
            <Lock className="w-3 h-3" />
            <span className="text-sm">
              {LAYOUT_OPTIONS.find((l) => l.id === currentLayout)?.label ||
                "Locked"}
            </span>
          </div>
        ) : (
          <Select value={currentLayout} onValueChange={onUpdateLayout}>
            <SelectTrigger className="flex-1 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((layout) => (
                <SelectItem key={layout.id} value={layout.id}>
                  {layout.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Color Picker */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-16">Color</Label>
        <Input
          type="color"
          value={currentColor}
          onChange={handleColorChange}
          className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-1"
        />
        <span className="text-sm font-mono uppercase text-muted-foreground">
          {currentColor}
        </span>
      </div>

      {/* Texture Dropdown */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-16">Texture</Label>
        <Select
          value={currentTexture || "none"}
          onValueChange={(v) =>
            onUpdateTexture(v === "none" ? null : (v as TextureOption))
          }
        >
          <SelectTrigger className="flex-1 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXTURE_OPTIONS.map((texture) => (
              <SelectItem
                key={texture.id || "none"}
                value={texture.id || "none"}
              >
                {texture.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Position indicator */}
      <div className="text-xs text-muted-foreground border-t pt-2">
        Page {page.number} • {pagePosition === "single" ? "DPS" : pagePosition}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(toolbarContent, document.body);
}
