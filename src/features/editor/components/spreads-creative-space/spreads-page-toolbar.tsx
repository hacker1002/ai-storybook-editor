// spreads-page-toolbar.tsx - Floating toolbar for page background controls in Spreads Creative Space
// Uses DOM-based positioning (not useToolbarPosition). Controls: layout dropdown, color picker, texture dropdown.
"use client";

import { useRef, useCallback, useState, useLayoutEffect } from "react";
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
import { createLogger } from "@/utils/logger";
import type {
  BaseSpread,
  PageToolbarContext,
  TextureOption,
} from "@/features/editor/components/canvas-spread-view";

const log = createLogger("Editor", "SpreadsPageToolbar");

// === Local positioning hook (DOM-based, not canvas-relative) ===

function usePageToolbarPosition(
  pageIndex: number,
  toolbarRef: React.RefObject<HTMLDivElement | null>
): { top: number; left: number } | null {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const calculate = useCallback(() => {
    const pageEl = document.querySelector(`[data-page-index="${pageIndex}"]`);
    const toolbarEl = toolbarRef.current;
    if (!pageEl || !toolbarEl) {
      setPosition(null);
      return;
    }

    const pageRect = pageEl.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();
    const gap = 8;

    // Prefer above page, fallback below if not enough space above
    let top = pageRect.top - toolbarRect.height - gap;
    if (top < gap) top = pageRect.bottom + gap;

    // Horizontally centered on page, clamped to viewport
    let left =
      pageRect.left + pageRect.width / 2 - toolbarRect.width / 2;
    left = Math.max(
      gap,
      Math.min(left, window.innerWidth - toolbarRect.width - gap)
    );

    setPosition({ top, left });
  }, [pageIndex, toolbarRef]);

  useLayoutEffect(() => {
    calculate(); // eslint-disable-line react-hooks/set-state-in-effect -- DOM measurement positioning pattern (same as use-toolbar-position.ts)

    // Recalculate on resize (debounced via requestAnimationFrame)
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(calculate);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [calculate]);

  return position;
}

// === Helpers ===

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// === Component ===

interface SpreadsPageToolbarProps<TSpread extends BaseSpread> {
  context: PageToolbarContext<TSpread>;
}

export function SpreadsPageToolbar<TSpread extends BaseSpread>({
  context,
}: SpreadsPageToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  const {
    page,
    pageIndex,
    position,
    onUpdateLayout,
    onUpdateColor,
    onUpdateTexture,
    availableLayouts,
    availableTextures,
    isLayoutLocked,
  } = context;

  // === DOM-based toolbar positioning ===

  const toolbarPosition = usePageToolbarPosition(pageIndex, toolbarRef);

  const toolbarStyle: React.CSSProperties = toolbarPosition
    ? {
        position: "fixed",
        top: `${toolbarPosition.top}px`,
        left: `${toolbarPosition.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  // === Handlers ===

  const handleLayoutChange = useCallback(
    (layoutId: string) => {
      if (isLayoutLocked) return;
      onUpdateLayout(layoutId);
      log.debug("SpreadsPageToolbar", "layout changed", { layoutId });
    },
    [isLayoutLocked, onUpdateLayout]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      onUpdateColor(color);
      log.debug("SpreadsPageToolbar", "color changed", { color });
    },
    [onUpdateColor]
  );

  const handleTextureChange = useCallback(
    (value: string) => {
      // Convert string sentinel "none" → null, otherwise cast to TextureOption
      const textureValue: TextureOption =
        value === "none" ? null : (value as TextureOption);
      onUpdateTexture(textureValue);
      log.debug("SpreadsPageToolbar", "texture changed", {
        texture: textureValue,
      });
    },
    [onUpdateTexture]
  );

  const handleToolbarClick = useCallback((e: React.MouseEvent) => {
    // Prevent click from propagating to canvas and deselecting the page
    e.stopPropagation();
  }, []);

  // === Position label ===

  const positionLabel =
    position === "left"
      ? "Left"
      : position === "right"
        ? "Right"
        : "Single";

  // === Render ===

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        onClick={handleToolbarClick}
        data-toolbar="page"
        role="toolbar"
        aria-label="Page background toolbar"
        className="min-w-[260px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Layout row */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Layout
          </Label>
          <Select
            value={page.layout ?? "default"}
            onValueChange={handleLayoutChange}
            disabled={isLayoutLocked}
          >
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Page layout"
            >
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {availableLayouts.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Color row */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Color
          </Label>
          <input
            type="color"
            value={page.background.color || "#FFFFFF"}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
            aria-label="Page background color"
          />
          <span className="text-xs font-mono uppercase text-muted-foreground">
            {(page.background.color || "#FFFFFF").toUpperCase()}
          </span>
        </div>

        {/* Texture row */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Texture
          </Label>
          <Select
            value={page.background.texture ?? "none"}
            onValueChange={handleTextureChange}
          >
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Page background texture"
            >
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {availableTextures
                .filter((t) => t !== null)
                .map((t) => (
                  <SelectItem key={t} value={t!}>
                    {capitalize(t!)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-2 text-center">
          <span className="text-xs text-muted-foreground">
            Page {page.number} &bull; {positionLabel}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
