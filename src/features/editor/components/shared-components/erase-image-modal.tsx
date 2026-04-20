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
import { Loader2, Undo2, RotateCcw, Eraser } from "lucide-react";
import { createLogger } from "@/utils/logger";
import { useInteractionLayer, useGlobalHotkey } from "@/features/editor/contexts";
import type { YieldedFromLinkage } from "@/features/editor/contexts/interaction-layer-provider";
import { uploadImageToStorage } from "@/apis/storage-api";
import { toast } from "sonner";
import {
  type Stroke,
  type StrokeMode,
  norm,
  paintStrokesOnCtx,
  BRUSH_PX,
} from "./erase-image-modal-utils";

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

// Max viewport footprint for the workspace canvas. Matches the previous
// max-h-[68vh] / max-w-[85vw] semantics from the <img>-based layout so the
// canvas visually occupies the same box.
const MAX_VW = 0.85;
const MAX_VH = 0.68;

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
  const [brushSize, setBrushSize] = useState<"T" | "S" | "M" | "L">("M");
  const [color, setColor] = useState("#ffffff");
  const [mode, setMode] = useState<StrokeMode>("paint");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const dialogContentRef = useRef<HTMLDivElement>(null);
  // Hidden <img> used purely as a drawImage source for the workspace canvas.
  const sourceImgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  // Mirror of activeStroke for reading inside event handlers without stale
  // closures and — critically — to commit strokes outside of React state
  // updaters (nested setState in an updater is double-invoked by StrictMode
  // → duplicate commits).
  const activeStrokeRef = useRef<Stroke | null>(null);

  // Toggle mode. Extracted so hotkey + button share the same path.
  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === "paint" ? "erase" : "paint";
      log.debug("toggleMode", "mode switched", { from: m, to: next });
      return next;
    });
  }, []);

  useInteractionLayer(
    "modal",
    open
      ? {
          id: "erase-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape", "1", "2", "3", "4", "e", "E"],
          onHotkey: (key) => {
            if (key === "Escape") handleCancel();
            if (key === "1") { setBrushSize("T"); log.debug("onHotkey", "brush:T"); }
            if (key === "2") { setBrushSize("S"); log.debug("onHotkey", "brush:S"); }
            if (key === "3") { setBrushSize("M"); log.debug("onHotkey", "brush:M"); }
            if (key === "4") { setBrushSize("L"); log.debug("onHotkey", "brush:L"); }
            if (key === "e" || key === "E") toggleMode();
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

  // Reset state when imageUrl changes while open.
  useEffect(() => {
    if (!open) return;
    setStrokes([]);
    setActiveStroke(null);
    activeStrokeRef.current = null;
    setIsImageLoaded(false);
    setMode("paint");
  }, [open, imageUrl]);

  // Size the workspace canvas to the natural aspect ratio clamped to the
  // max viewport footprint, then fire initial paint. Runs once per image load.
  const handleImageLoad = useCallback(() => {
    const img = sourceImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || img.naturalWidth === 0) return;

    const maxW = window.innerWidth * MAX_VW;
    const maxH = window.innerHeight * MAX_VH;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = maxW;
    let h = maxW / ar;
    if (h > maxH) {
      h = maxH;
      w = maxH * ar;
    }
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);

    setIsImageLoaded(true);
    log.info("handleImageLoad", "canvas sized", {
      displayW: canvas.width,
      displayH: canvas.height,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    });
  }, []);

  // Re-render the workspace canvas on any stroke change. Draws the source
  // image then composites all strokes on top. Erase strokes use
  // destination-out, so transparent pixels reveal the checker-bg wrapper.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = sourceImgRef.current;
    if (!canvas || !img || !isImageLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    paintStrokesOnCtx(
      ctx,
      strokes,
      activeStroke,
      canvas.width,
      canvas.height,
      1,
      false
    );
  }, [strokes, activeStroke, isImageLoaded]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const normalized = norm(x, y, canvas.width, canvas.height);
      const stroke: Stroke = {
        points: [normalized],
        size: brushSize,
        mode,
        color,
      };
      activeStrokeRef.current = stroke;
      setActiveStroke(stroke);
    },
    [brushSize, color, mode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      // Cursor indicator sits in CSS px relative to the canvas rect.
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      const current = activeStrokeRef.current;
      if (!current) return;
      const updated: Stroke = {
        ...current,
        points: [...current.points, norm(x, y, canvas.width, canvas.height)],
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
      mode: committed.mode,
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
    const img = sourceImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || strokes.length === 0) return;

    if (img.naturalWidth === 0) {
      log.warn("handleSave", "image not loaded", {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      return;
    }

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    log.info("handleSave", "start", {
      strokeCount: strokes.length,
      naturalW,
      naturalH,
      pathPrefix,
    });
    setIsSaving(true);

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = naturalW;
      offscreen.height = naturalH;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) throw new Error("Could not get 2D context");

      offCtx.drawImage(img, 0, 0, naturalW, naturalH);
      // Display-to-natural scale is proportional (we preserved aspect ratio
      // when sizing canvas), so averaging W/H scales is mathematically
      // identical to either axis alone, just defensive.
      const brushScale =
        (naturalW / canvas.width + naturalH / canvas.height) / 2;
      paintStrokesOnCtx(
        offCtx,
        strokes,
        null,
        naturalW,
        naturalH,
        brushScale,
        false
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => {
          if (!b)
            reject(
              new Error(
                "Canvas export failed — canvas may be tainted by CORS"
              )
            );
          else resolve(b);
        }, "image/png");
      });

      const file = new File([blob], `erased-${Date.now()}.png`, {
        type: "image/png",
      });
      const result = await uploadImageToStorage(file, pathPrefix);

      log.info("handleSave", "upload complete", {
        publicUrl: result.publicUrl.slice(0, 60),
      });
      onSaved(result.publicUrl);
      setStrokes([]);
      setActiveStroke(null);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      log.error("handleSave", "error", {
        error: msg,
        strokeCount: strokes.length,
      });
      toast.error(
        msg.includes("tainted") || msg.includes("CORS")
          ? "Canvas export blocked — configure CORS headers for the image bucket."
          : msg
      );
    } finally {
      setIsSaving(false);
    }
  }, [strokes, pathPrefix, onSaved, onOpenChange]);

  // Display-space brush diameter for the cursor indicator. Canvas intrinsic
  // equals display px (we sized it that way), so no conversion needed.
  const cursorDiameter = BRUSH_PX[brushSize] * 2;

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
            {/* Hidden source image — drawn onto the workspace canvas. Kept in
                DOM so CORS + load events work normally. */}
            <img
              ref={sourceImgRef}
              src={imageUrl}
              alt={imageTitle ?? "Source image"}
              crossOrigin="anonymous"
              className="hidden"
              onLoad={handleImageLoad}
            />

            {!isImageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-white/40" />
              </div>
            )}

            {/* Checker-bg wrapper reveals transparency produced by erase
                strokes. The canvas is sized to match natural aspect ratio so
                it hugs the wrapper exactly — no letterbox gap. */}
            <div className="relative inline-block bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] overflow-hidden">
              <canvas
                ref={canvasRef}
                className="block cursor-none"
                style={{ pointerEvents: isSaving ? "none" : undefined }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerLeave}
              />
              {cursorPos && !isSaving && isImageLoaded && (
                <div
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    width: cursorDiameter,
                    height: cursorDiameter,
                    left: cursorPos.x - cursorDiameter / 2,
                    top: cursorPos.y - cursorDiameter / 2,
                    // Paint: semi-transparent fill in active color.
                    // Erase: no fill (outline only) so user sees pixels
                    // underneath — closer to the eraser metaphor.
                    backgroundColor:
                      mode === "paint" ? `${color}80` : "transparent",
                    // Dual ring: inner white + outer black so cursor stays
                    // visible regardless of brush vs. background contrast.
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
            {(["T", "S", "M", "L"] as const).map((size) => (
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

            <div className="w-px h-6 bg-white/20 mx-1" />

            {/* Paint mode — color swatch directly opens native color picker
                (native picker has built-in eyedropper). Variant=default shows
                active state when paint is the current mode. */}
            <Button
              size="sm"
              variant={mode === "paint" ? "default" : "outline"}
              className="h-8 px-2 gap-2"
              disabled={isSaving}
              onClick={() => {
                if (mode !== "paint") {
                  setMode("paint");
                  log.debug("toolbar", "mode paint");
                }
                colorInputRef.current?.click();
              }}
              aria-label="Paint color"
              title="Paint with color"
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

            {/* Erase mode — paints with destination-out, producing true
                transparent pixels. Swatch shows the checker pattern so the
                purpose is visually obvious. */}
            <Button
              size="sm"
              variant={mode === "erase" ? "default" : "outline"}
              className="h-8 px-2 gap-2"
              disabled={isSaving}
              onClick={() => {
                setMode("erase");
                log.debug("toolbar", "mode erase");
              }}
              aria-label="Erase to transparent (E)"
              title="Erase to transparent (E)"
            >
              <div
                className="w-4 h-4 rounded-sm border border-white/20 shrink-0 bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:8px_8px]"
              />
              <Eraser className="h-3.5 w-3.5" />
            </Button>

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
