// spreads-text-toolbar.tsx - Floating toolbar for illustration textbox items in Spreads Creative Space
// Provides full typography controls: font, size, color, bold/italic/underline/strikethrough,
// alignment, line-height, letter-spacing, plus geometry and clone/delete actions.
"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Copy,
  Trash2,
  Minus,
  Plus,
  Pencil,
} from "lucide-react";
import {
  useToolbarPosition,
  type BaseSpread,
  type TextToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import {
  clampGeometry,
  GeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import type { SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";

const log = createLogger("Editor", "SpreadsTextToolbar");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_OPTIONS = [
  { label: "Nunito", value: "Nunito" },
  { label: "Arial", value: "Arial" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Georgia", value: "Georgia" },
  { label: "Verdana", value: "Verdana" },
] as const;

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 1;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SpreadsTextToolbarProps<TSpread extends BaseSpread> {
  context: TextToolbarContext<TSpread>;
}

export function SpreadsTextToolbar<TSpread extends BaseSpread>({
  context,
}: SpreadsTextToolbarProps<TSpread>) {
  // --- Refs ---
  const toolbarRef = useRef<HTMLDivElement>(null);

  // --- Context destructuring ---
  const {
    item,
    onUpdate,
    onDelete,
    onClone,
    onFormatText,
    onEditText,
    selectedGeometry,
    canvasRef,
  } = context;

  // --- Language resolution ---
  const editorLangCode = useLanguageCode();
  const langResult = useMemo(
    () =>
      getTextboxContentForLanguage(
        item as unknown as Record<string, unknown>,
        editorLangCode
      ),
    [item, editorLangCode]
  );
  const langCode = langResult?.langKey ?? editorLangCode;
  const content = langResult?.content as SpreadTextboxContent | undefined;

  // --- Derived typography (with fallback defaults) ---
  const typography = content?.typography ?? {};
  const fontFamily = typography.family ?? "Nunito";
  const fontSize = typography.size ?? 16;
  const color = typography.color ?? "#000000";
  const fontWeight = typography.weight ?? 400;
  const fontStyle = typography.style ?? "normal";
  const textDecoration = typography.decoration ?? "none";
  const textAlign = typography.textAlign ?? "left";
  const lineHeight = typography.lineHeight ?? 1.5;
  const letterSpacing = typography.letterSpacing ?? 0;

  // --- Derived geometry ---
  const geometry = content?.geometry;

  log.debug("render", "toolbar state", {
    itemId: item.id,
    langCode,
    fontFamily,
    fontSize,
    fontWeight,
  });

  // --- Local state for optimistic font size stepper UX ---
  const [localFontSize, setLocalFontSize] = useState(fontSize);

  // Sync local state when external value changes (e.g. undo, different item selected)
  useEffect(() => {
    setLocalFontSize(fontSize);
  }, [fontSize]);

  // --- Positioning ---
  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  // ---------------------------------------------------------------------------
  // Typography handlers
  // ---------------------------------------------------------------------------

  const handleFontChange = useCallback(
    (value: string) => {
      log.debug("handleFontChange", "font family change", { value });
      onFormatText({ family: value });
    },
    [onFormatText]
  );

  const handleFontSizeStep = useCallback(
    (delta: 1 | -1) => {
      const next = Math.min(
        MAX_FONT_SIZE,
        Math.max(MIN_FONT_SIZE, localFontSize + delta * FONT_SIZE_STEP)
      );
      log.debug("handleFontSizeStep", "font size step", {
        from: localFontSize,
        to: next,
      });
      setLocalFontSize(next);
      onFormatText({ size: next });
    },
    [localFontSize, onFormatText]
  );

  const handleFontSizeInput = useCallback(
    (value: string) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) return;
      const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed));
      log.debug("handleFontSizeInput", "font size input", { value: clamped });
      setLocalFontSize(clamped);
      onFormatText({ size: clamped });
    },
    [onFormatText]
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      log.debug("handleColorChange", "color change", { color: e.target.value });
      onFormatText({ color: e.target.value });
    },
    [onFormatText]
  );

  const handleToggleBold = useCallback(() => {
    const next = fontWeight === 700 ? 400 : 700;
    log.debug("handleToggleBold", "toggle bold", {
      from: fontWeight,
      to: next,
    });
    onFormatText({ weight: next });
  }, [fontWeight, onFormatText]);

  const handleToggleItalic = useCallback(() => {
    const next = fontStyle === "italic" ? "normal" : "italic";
    log.debug("handleToggleItalic", "toggle italic", {
      from: fontStyle,
      to: next,
    });
    onFormatText({ style: next });
  }, [fontStyle, onFormatText]);

  // Underline and strikethrough are mutually exclusive
  const handleToggleUnderline = useCallback(() => {
    const next = textDecoration === "underline" ? "none" : "underline";
    log.debug("handleToggleUnderline", "toggle underline", {
      from: textDecoration,
      to: next,
    });
    onFormatText({ decoration: next });
  }, [textDecoration, onFormatText]);

  const handleToggleStrikethrough = useCallback(() => {
    const next = textDecoration === "line-through" ? "none" : "line-through";
    log.debug("handleToggleStrikethrough", "toggle strikethrough", {
      from: textDecoration,
      to: next,
    });
    onFormatText({ decoration: next });
  }, [textDecoration, onFormatText]);

  const handleAlignChange = useCallback(
    (align: string) => {
      log.debug("handleAlignChange", "align change", { align });
      onFormatText({ textAlign: align as "left" | "center" | "right" });
    },
    [onFormatText]
  );

  const handleLineHeightChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      const clamped = Math.min(3.0, Math.max(0.5, parsed));
      log.debug("handleLineHeightChange", "line height change", {
        value: clamped,
      });
      onFormatText({ lineHeight: clamped });
    },
    [onFormatText]
  );

  const handleLetterSpacingChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      const clamped = Math.min(20, Math.max(-5, parsed));
      log.debug("handleLetterSpacingChange", "letter spacing change", {
        value: clamped,
      });
      onFormatText({ letterSpacing: clamped });
    },
    [onFormatText]
  );

  // ---------------------------------------------------------------------------
  // Geometry handler — geometry lives inside language content, not on item root
  // ---------------------------------------------------------------------------

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      if (!geometry || !content) {
        log.warn("handleGeometryChange", "no geometry for current language", {
          langCode,
        });
        return;
      }
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 100 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 100 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 100 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 100 - geometry.y);

      log.debug("handleGeometryChange", "geometry change", {
        field,
        value: clamped,
      });

      onUpdate({
        [langCode]: {
          ...content,
          geometry: { ...geometry, [field]: clamped },
        },
      } as unknown as Partial<SpreadTextbox>);
    },
    [geometry, content, langCode, onUpdate]
  );

  // ---------------------------------------------------------------------------
  // Toggle button helper
  // ---------------------------------------------------------------------------

  const toggleClass = (active: boolean) =>
    `h-8 flex items-center justify-center rounded-md text-sm transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
    }`;

  // --- SSR guard ---
  if (typeof document === "undefined") return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="textbox"
        role="toolbar"
        aria-label="Text formatting toolbar"
        className="min-w-[320px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Row 1: Font family / Size stepper / Color */}
        <div className="flex items-center gap-2">
          {/* Font family select */}
          <Select value={fontFamily} onValueChange={handleFontChange}>
            <SelectTrigger
              className="h-8 text-sm flex-1"
              aria-label="Font family"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Font size stepper */}
          <div className="flex items-center">
            <button
              onClick={() => handleFontSizeStep(-1)}
              aria-label="Decrease font size"
              className="h-8 w-7 flex items-center justify-center rounded-l-md border bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="text"
              value={localFontSize}
              onChange={(e) => handleFontSizeInput(e.target.value)}
              aria-label="Font size"
              className="w-12 h-8 text-center text-sm border-y bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => handleFontSizeStep(1)}
              aria-label="Increase font size"
              className="h-8 w-7 flex items-center justify-center rounded-r-md border bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Color picker */}
          <input
            type="color"
            value={color}
            onChange={handleColorChange}
            aria-label="Text color"
            className="w-7 h-7 rounded border cursor-pointer"
          />
        </div>

        {/* Row 2: Style toggles (Bold / Italic / Underline / Strikethrough) */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={handleToggleBold}
            aria-label="Bold"
            className={toggleClass(fontWeight === 700)}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggleItalic}
            aria-label="Italic"
            className={toggleClass(fontStyle === "italic")}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggleUnderline}
            aria-label="Underline"
            className={toggleClass(textDecoration === "underline")}
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggleStrikethrough}
            aria-label="Strikethrough"
            className={toggleClass(textDecoration === "line-through")}
          >
            <Strikethrough className="w-4 h-4" />
          </button>
        </div>

        {/* Row 3: Alignment (exclusive toggle) */}
        <div className="grid grid-cols-4 gap-1">
          {(
            [
              { value: "left", Icon: AlignLeft, label: "Align left" },
              { value: "center", Icon: AlignCenter, label: "Align center" },
              { value: "right", Icon: AlignRight, label: "Align right" },
              { value: "justify", Icon: AlignJustify, label: "Justify" },
            ] as const
          ).map(({ value, Icon, label }) => (
            <button
              key={value}
              onClick={() => handleAlignChange(value)}
              aria-label={label}
              className={toggleClass(textAlign === value)}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Row 4: Line height / Letter spacing */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            <Label className="text-xs text-muted-foreground shrink-0">
              Line H
            </Label>
            <input
              type="number"
              step={0.1}
              min={0.5}
              max={3.0}
              value={lineHeight}
              onChange={(e) => handleLineHeightChange(e.target.value)}
              aria-label="Line height"
              className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <Label className="text-xs text-muted-foreground shrink-0">
              Spacing
            </Label>
            <input
              type="number"
              step={1}
              min={-5}
              max={20}
              value={letterSpacing}
              onChange={(e) => handleLetterSpacingChange(e.target.value)}
              aria-label="Letter spacing"
              className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>

        {/* Geometry Section */}
        <GeometrySection
          geometry={geometry ?? { x: 0, y: 0, w: 0, h: 0 }}
          onGeometryChange={handleGeometryChange}
        />

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Pencil}
              label="Edit text"
              onClick={onEditText}
              disabled={!onEditText}
            />
            {onClone && (
              <ToolbarIconButton
                icon={Copy}
                label="Clone textbox"
                onClick={onClone}
              />
            )}
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete textbox"
            onClick={onDelete}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
