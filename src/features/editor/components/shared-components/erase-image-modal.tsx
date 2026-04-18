"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2, RotateCcw } from "lucide-react";
import { createLogger } from "@/utils/logger";
import { useInteractionLayer, useGlobalHotkey } from "@/features/editor/contexts";
import type { YieldedFromLinkage } from "@/features/editor/contexts/interaction-layer-provider";
import { uploadImageToStorage } from "@/apis/storage-api";
import { toast } from "sonner";
import { type Stroke, norm, paintStrokesOnCtx, BRUSH_PX } from "./erase-image-modal-utils";

const log = createLogger("Editor", "EraseImageModal");

interface EraseImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  imageTitle?: string;
  pathPrefix: string;
  onSaved: (newUrl: string) => void;
  yieldedFrom?: YieldedFromLinkage;
}

// ── Component ───────────────────────────────────────────────────────────────

export function EraseImageModal({
  open,
  onOpenChange,
  imageUrl,
  imageTitle,
  pathPrefix,
  onSaved,
  yieldedFrom,
}: EraseImageModalProps) {
  const [brushSize, setBrushSize] = useState<"S" | "M" | "L">("M");
  const [color, setColor] = useState("#ffffff");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const dialogContentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  // Mirror of activeStroke for reading inside event handlers without stale closures
  // and — critically — to commit strokes outside of React state updaters
  // (nested setState in an updater is double-invoked by StrictMode → duplicate commits).
  const activeStrokeRef = useRef<Stroke | null>(null);

  useInteractionLayer(
    "modal",
    open
      ? {
          id: "erase-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape", "1", "2", "3"],
          onHotkey: (key) => {
            if (key === "Escape") handleCancel();
            if (key === "1") { setBrushSize("S"); log.debug("onHotkey", "brush:S"); }
            if (key === "2") { setBrushSize("M"); log.debug("onHotkey", "brush:M"); }
            if (key === "3") { setBrushSize("L"); log.debug("onHotkey", "brush:L"); }
          },
          onForcePop: () => {
            setStrokes([]);
            setActiveStroke(null);
            activeStrokeRef.current = null;
            setIsSaving(false);
          },
          yieldedFrom,
        }
      : null
  );

  useGlobalHotkey(
    (e) => open && (e.ctrlKey || e.metaKey) && e.key === "z",
    () => {
      setStrokes((prev) => {
        const next = prev.slice(0, -1);
        log.debug("undo", "stroke removed", { remainingStrokes: next.length });
        return next;
      });
    },
    [open]
  );

  // Reset strokes + image-loaded flag when imageUrl changes while open
  useEffect(() => {
    if (!open) return;
    setStrokes([]);
    setActiveStroke(null);
    activeStrokeRef.current = null;
    setIsImageLoaded(false);

    const img = imgRef.current;
    const overlay = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!img || !overlay || !wrapper) return;

    const init = () => {
      overlay.width = wrapper.clientWidth;
      overlay.height = wrapper.clientHeight;
    };

    if (img.complete && img.naturalWidth > 0) {
      init();
    } else {
      img.addEventListener("load", init, { once: true });
    }
  }, [open, imageUrl]);

  // Repaint overlay canvas on every stroke change
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    paintStrokesOnCtx(ctx, strokes, activeStroke, overlay.width, overlay.height, 1);
  }, [strokes, activeStroke]);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const overlay = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!img || !overlay || !wrapper) return;

    overlay.width = wrapper.clientWidth;
    overlay.height = wrapper.clientHeight;

    setIsImageLoaded(true);
    log.info("handleImageLoad", "canvas initialized", {
      displayW: overlay.width,
      displayH: overlay.height,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const normalized = norm(x, y, overlay.width, overlay.height);
      const stroke: Stroke = { points: [normalized], size: brushSize, color };
      activeStrokeRef.current = stroke;
      setActiveStroke(stroke);
    },
    [brushSize, color]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCursorPos({ x, y });
      const current = activeStrokeRef.current;
      if (!current) return;
      const updated: Stroke = {
        ...current,
        points: [...current.points, norm(x, y, overlay.width, overlay.height)],
      };
      activeStrokeRef.current = updated;
      setActiveStroke(updated);
    },
    []
  );

  const handlePointerLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  const handlePointerUp = useCallback(() => {
    const committed = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setActiveStroke(null);
    if (!committed || committed.points.length === 0) return;
    setStrokes((s) => [...s, committed]);
    log.debug("stroke", "committed", {
      pointCount: committed.points.length,
      size: committed.size,
      color: committed.color,
    });
  }, []);

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      log.debug("undo", "stroke removed", { remainingStrokes: next.length });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    if (strokes.length >= 3) {
      setResetConfirmOpen(true);
    } else {
      log.debug("reset", "cleared", { clearedCount: strokes.length });
      setStrokes([]);
    }
  }, [strokes.length]);

  const handleConfirmReset = useCallback(() => {
    log.debug("reset", "confirmed", { clearedCount: strokes.length });
    setStrokes([]);
    setResetConfirmOpen(false);
  }, [strokes.length]);

  const handleCancel = useCallback(() => {
    if (strokes.length > 0) {
      setDiscardOpen(true);
    } else {
      onOpenChange(false);
    }
  }, [strokes.length, onOpenChange]);

  const handleConfirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    setStrokes([]);
    setActiveStroke(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(async () => {
    const img = imgRef.current;
    const overlay = overlayRef.current;
    if (!img || !overlay || strokes.length === 0) return;

    if (img.naturalWidth === 0) {
      log.warn("handleSave", "image not loaded", {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      return;
    }

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    log.info("handleSave", "start", { strokeCount: strokes.length, naturalW, naturalH, pathPrefix });
    setIsSaving(true);

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = naturalW;
      offscreen.height = naturalH;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) throw new Error("Could not get 2D context");

      offCtx.drawImage(img, 0, 0, naturalW, naturalH);
      const brushScale = (naturalW / overlay.width + naturalH / overlay.height) / 2;
      paintStrokesOnCtx(offCtx, strokes, null, naturalW, naturalH, brushScale, false);

      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => {
          if (!b) reject(new Error("Canvas export failed — canvas may be tainted by CORS"));
          else resolve(b);
        }, "image/png");
      });

      const file = new File([blob], `erased-${Date.now()}.png`, { type: "image/png" });
      const result = await uploadImageToStorage(file, pathPrefix);

      log.info("handleSave", "upload complete", { publicUrl: result.publicUrl.slice(0, 60) });
      onSaved(result.publicUrl);
      setStrokes([]);
      setActiveStroke(null);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      log.error("handleSave", "error", { error: msg, strokeCount: strokes.length });
      toast.error(
        msg.includes("tainted") || msg.includes("CORS")
          ? "Canvas export blocked — configure CORS headers for the image bucket."
          : msg
      );
    } finally {
      setIsSaving(false);
    }
  }, [strokes, pathPrefix, onSaved, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleCancel}>
        <DialogContent
          ref={dialogContentRef}
          aria-describedby={undefined}
          className="sm:max-w-[90vw] max-h-[95vh] p-0 overflow-hidden bg-black/95 border-none flex flex-col [&>button]:text-white [&>button]:hover:text-white/80"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-white text-sm">
              {imageTitle ? `${imageTitle} — Paint Over` : "Paint Over Image"}
            </DialogTitle>
          </DialogHeader>

          {/* Workspace */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden min-h-[60vh]">
            {!isImageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-white/40" />
              </div>
            )}
            {/* Inner wrapper hugs the rendered image rect (img uses intrinsic
                sizing, no object-contain), so checker bg shows only through
                genuinely transparent pixels — not through letterbox gaps. */}
            <div
              ref={wrapperRef}
              className="relative inline-block bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] overflow-hidden"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt={imageTitle ?? "Source image"}
                crossOrigin="anonymous"
                className="max-h-[68vh] max-w-[85vw] block"
                onLoad={handleImageLoad}
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full cursor-none"
                style={{ pointerEvents: isSaving ? "none" : undefined }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerLeave}
              />
              {cursorPos && !isSaving && (
                <div
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    width: BRUSH_PX[brushSize] * 2,
                    height: BRUSH_PX[brushSize] * 2,
                    left: cursorPos.x - BRUSH_PX[brushSize],
                    top: cursorPos.y - BRUSH_PX[brushSize],
                    backgroundColor: `${color}80`,
                    // Dual ring: inner white + outer black so cursor stays visible
                    // regardless of brush color vs. background color contrast.
                    boxShadow: "0 0 0 1px #fff, 0 0 0 2px #000",
                  }}
                />
              )}
            </div>

            {isSaving && (
              <div className="absolute inset-0 bg-white/10 flex items-center justify-center z-30">
                <div className="text-center text-white">
                  <Loader2 className="animate-spin h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">Saving erased image...</p>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="px-4 pb-4 flex items-center gap-2 flex-wrap shrink-0">
            {/* Brush size */}
            {(["S", "M", "L"] as const).map((size) => (
              <Button
                key={size}
                size="sm"
                variant={brushSize === size ? "default" : "outline"}
                className="w-8 h-8 p-0 text-xs"
                onClick={() => {
                  setBrushSize(size);
                  log.debug("toolbar", "brush size", { size });
                }}
                disabled={isSaving}
              >
                {size}
              </Button>
            ))}

            {/* Color swatch — directly opens native color picker (has built-in eyedropper) */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 gap-2"
              disabled={isSaving}
              onClick={() => colorInputRef.current?.click()}
            >
              <div
                className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-mono">{color}</span>
            </Button>
            <input
              ref={colorInputRef}
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                log.debug("toolbar", "color picker", { color: e.target.value });
              }}
              className="sr-only"
              disabled={isSaving}
              aria-hidden="true"
            />

            <div className="w-px h-6 bg-white/20 mx-1" />

            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={handleUndo}
              disabled={strokes.length === 0 || isSaving}
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={handleReset}
              disabled={strokes.length === 0 || isSaving}
              aria-label="Reset"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <div className="flex-1" />

            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={strokes.length === 0 || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard confirm dialog */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved paint strokes. They will be lost if you close.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirm dialog */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all strokes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {strokes.length} paint strokes from the canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep strokes</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>Clear all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
