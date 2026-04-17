"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useInteractionLayer } from "@/features/editor/contexts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, Loader2, Plus, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import { callCropObjectImage } from "@/apis/retouch-api";
import { uploadImageToStorage } from "@/apis/storage-api";
import type { SpreadImage } from "@/types/spread-types";
import {
  type AspectRatio,
  type ResizeCorner,
  type CropBoundingBox,
  type CropResults,
  type CropCreateResult,
  BOX_COLORS,
  MAX_BOXES,
  DEFAULT_BOX_SIZE_PERCENT,
  MIN_BOX_SIZE_PERCENT,
  clamp,
  base64ToFile,
  BoundingBoxOverlay,
  CropResultSection,
} from "./crop-image-modal-parts";
import { getPercentRatio } from "@/utils/aspect-ratio-utils";

export type { CropCreateResult } from "./crop-image-modal-parts";

const log = createLogger("Editor", "CropImageModal");

// === Types ===

interface CropImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onCreateImages: (result: CropCreateResult) => void;
}

// === Helpers ===

function getSelectedIllustrationUrl(image: SpreadImage): string | undefined {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((i) => i.is_selected);
  if (selected) return selected.media_url;
  if (image.illustrations?.[0]) return image.illustrations[0].media_url;
  return image.media_url;
}

// === Main Component ===

export function CropImageModal({
  open,
  onOpenChange,
  image,
  onCreateImages,
}: CropImageModalProps) {
  const [boundingBoxes, setBoundingBoxes] = useState<CropBoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropResults, setCropResults] = useState<CropResults | null>(null);
  const [selectedCropIndices, setSelectedCropIndices] = useState<Set<number>>(
    new Set()
  );
  const [isCreating, setIsCreating] = useState(false);
  const [imageNatural, setImageNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [imageDisplay, setImageDisplay] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const imageAreaRef = useRef<HTMLDivElement>(null);
  const resultSectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // Register modal slot — prevents Delete/Escape bubbling to item slot while open.
  // captureClickOutside: true so click outside only closes modal, not deselects item.
  // onForcePop: called on cascade pop (e.g. spread switch) — discard draft + close.
  useInteractionLayer(
    "modal",
    open
      ? {
          id: "crop-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape", "Delete", "Backspace"],
          onHotkey: (key) => {
            if (key === "Escape" && !isBusy) handleOpenChange(false);
            if ((key === "Delete" || key === "Backspace") && selectedBoxId)
              handleBoxDelete(selectedBoxId);
          },
          onClickOutside: () => handleOpenChange(false),
          onForcePop: () => {
            resetState();
            onOpenChange(false);
          },
          captureClickOutside: true,
          portalSelectors: [
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            '[role="listbox"]',
          ],
        }
      : null
  );

  const dragStateRef = useRef<{
    type: "drag" | "resize";
    boxId: string;
    corner?: ResizeCorner;
    startBox: CropBoundingBox;
    startMouseX: number;
    startMouseY: number;
  } | null>(null);

  // Snapshot boxes at crop time so create uses the correct geometry
  const croppedBoxesRef = useRef<CropBoundingBox[]>([]);
  // Guard against state updates after modal close
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = open;
    return () => {
      mountedRef.current = false;
    };
  }, [open]);

  const isBusy = isCropping || isCreating;
  const imageUrl = getSelectedIllustrationUrl(image);

  const resetState = useCallback(() => {
    setBoundingBoxes([]);
    setSelectedBoxId(null);
    setIsCropping(false);
    setCropResults(null);
    setSelectedCropIndices(new Set());
    setIsCreating(false);
    setImageNatural(null);
    setImageDisplay(null);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState();
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      setImageNatural({ w: nw, h: nh });

      const cw = containerRef.current?.clientWidth ?? 600;
      const scale = Math.min(cw / nw, 400 / nh, 1);
      setImageDisplay({ w: nw * scale, h: nh * scale });
    },
    []
  );

  // === Box Management ===

  const handleBoxAdd = useCallback(() => {
    if (boundingBoxes.length >= MAX_BOXES || !imageNatural) return;
    const ratio: AspectRatio = "1:1";
    const pr = getPercentRatio(ratio, imageNatural.w, imageNatural.h);
    const boxH = DEFAULT_BOX_SIZE_PERCENT;
    const boxW = Math.min(boxH * pr, 100);

    const newBox: CropBoundingBox = {
      id: crypto.randomUUID(),
      x: clamp(50 - boxW / 2, 0, 100 - boxW),
      y: clamp(50 - boxH / 2, 0, 100 - boxH),
      w: boxW,
      h: Math.min(boxH, 100),
      aspectRatio: ratio,
    };
    setBoundingBoxes((prev) => [...prev, newBox]);
    setSelectedBoxId(newBox.id);
    log.debug("handleBoxAdd", "added", { boxId: newBox.id });
  }, [boundingBoxes.length, imageNatural]);

  const handleBoxUpdate = useCallback(
    (boxId: string, updates: Partial<CropBoundingBox>) => {
      setBoundingBoxes((prev) =>
        prev.map((b) => (b.id === boxId ? { ...b, ...updates } : b))
      );
    },
    []
  );

  const handleBoxDelete = useCallback(
    (boxId: string) => {
      setBoundingBoxes((prev) => prev.filter((b) => b.id !== boxId));
      if (selectedBoxId === boxId) setSelectedBoxId(null);
    },
    [selectedBoxId]
  );

  const handleRatioChange = useCallback(
    (boxId: string, newRatio: AspectRatio) => {
      if (!imageNatural) return;
      setBoundingBoxes((prev) =>
        prev.map((box) => {
          if (box.id !== boxId) return box;
          const pr = getPercentRatio(newRatio, imageNatural.w, imageNatural.h);
          const area = box.w * box.h;
          let newW = Math.sqrt(area * pr);
          let newH = newW / pr;
          newW = clamp(newW, MIN_BOX_SIZE_PERCENT, 100);
          newH = newW / pr;
          if (newH > 100) {
            newH = 100;
            newW = newH * pr;
          }
          const cx = box.x + box.w / 2;
          const cy = box.y + box.h / 2;
          return {
            ...box,
            x: clamp(cx - newW / 2, 0, 100 - newW),
            y: clamp(cy - newH / 2, 0, 100 - newH),
            w: newW,
            h: newH,
            aspectRatio: newRatio,
          };
        })
      );
    },
    [imageNatural]
  );

  // === Drag & Resize ===

  const handlePointerDown = useCallback(
    (
      e: React.MouseEvent,
      boxId: string,
      type: "drag" | "resize",
      corner?: ResizeCorner
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const box = boundingBoxes.find((b) => b.id === boxId);
      if (!box || isBusy) return;
      setSelectedBoxId(boxId);
      dragStateRef.current = {
        type,
        boxId,
        corner,
        startBox: { ...box },
        startMouseX: e.clientX,
        startMouseY: e.clientY,
      };
    },
    [boundingBoxes, isBusy]
  );

  useEffect(() => {
    if (!open) return;

    const onMove = (e: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st || !imageAreaRef.current) return;
      const rect = imageAreaRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - st.startMouseX) / rect.width) * 100;
      const dyPct = ((e.clientY - st.startMouseY) / rect.height) * 100;
      const sb = st.startBox;

      if (st.type === "drag") {
        handleBoxUpdate(st.boxId, {
          x: clamp(sb.x + dxPct, 0, 100 - sb.w),
          y: clamp(sb.y + dyPct, 0, 100 - sb.h),
        });
      } else if (st.type === "resize" && st.corner && imageNatural) {
        const pr = getPercentRatio(
          sb.aspectRatio,
          imageNatural.w,
          imageNatural.h
        );
        const signX = st.corner.includes("e") ? 1 : -1;
        let newW = Math.max(MIN_BOX_SIZE_PERCENT, sb.w + signX * dxPct);
        let newH = newW / pr;

        if (newH > 100) {
          newH = 100;
          newW = newH * pr;
        }
        if (newW > 100) {
          newW = 100;
          newH = newW / pr;
        }

        let newX = st.corner.includes("w") ? sb.x + sb.w - newW : sb.x;
        let newY = st.corner.includes("n") ? sb.y + sb.h - newH : sb.y;

        if (newX < 0) {
          newW += newX;
          newX = 0;
          newH = newW / pr;
        }
        if (newY < 0) {
          newH += newY;
          newY = 0;
          newW = newH * pr;
        }
        if (newX + newW > 100) {
          newW = 100 - newX;
          newH = newW / pr;
        }
        if (newY + newH > 100) {
          newH = 100 - newY;
          newW = newH * pr;
        }

        if (newW < MIN_BOX_SIZE_PERCENT || newH < MIN_BOX_SIZE_PERCENT) return;

        handleBoxUpdate(st.boxId, { x: newX, y: newY, w: newW, h: newH });
      }
    };

    const onUp = () => {
      dragStateRef.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [open, handleBoxUpdate, imageNatural]);

  // === Crop ===

  const handleCrop = useCallback(async () => {
    if (boundingBoxes.length === 0 || !imageUrl) return;
    log.info("handleCrop", "start", { boxCount: boundingBoxes.length });

    croppedBoxesRef.current = boundingBoxes.map((b) => ({ ...b }));
    setIsCropping(true);

    try {
      const cropRes = await callCropObjectImage({
        imageUrl,
        boundingBoxes: boundingBoxes.map((b) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          aspectRatio: b.aspectRatio,
        })),
      });

      if (!mountedRef.current) return;
      if (!cropRes.success || !cropRes.data) {
        throw new Error(cropRes.error || "Crop failed");
      }

      const results: CropResults = {
        cropped: cropRes.data.croppedObjects.map((o) => ({
          boxIndex: o.boxIndex,
          base64: o.base64,
          mimeType: o.mimeType,
          aspectRatio: o.aspectRatio,
        })),
      };

      setCropResults(results);
      setSelectedCropIndices(new Set());
      log.info("handleCrop", "complete", {
        croppedCount: results.cropped.length,
      });
      setTimeout(
        () => resultSectionRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    } catch (err) {
      if (!mountedRef.current) return;
      log.error("handleCrop", "failed", { error: String(err) });
      toast.error(
        err instanceof Error ? err.message : "Crop failed. Please try again."
      );
    } finally {
      if (mountedRef.current) setIsCropping(false);
    }
  }, [boundingBoxes, imageUrl]);

  // === Create New Images (base64 → upload → callback) ===

  const handleCreateNewImages = useCallback(async () => {
    if (!cropResults || selectedCropIndices.size === 0) return;
    setIsCreating(true);
    const snappedBoxes = croppedBoxesRef.current;
    const selectedCrops = cropResults.cropped.filter((o) =>
      selectedCropIndices.has(o.boxIndex)
    );
    log.info("handleCreateNewImages", "start", {
      selectedCount: selectedCrops.length,
    });

    try {
      const uploadedCropped = await Promise.all(
        selectedCrops.map(async (obj) => {
          const timestamp = Date.now();
          const file = base64ToFile(
            obj.base64,
            `${timestamp}-crop-${obj.boxIndex}.png`
          );
          const { publicUrl } = await uploadImageToStorage(
            file,
            "crop-objects"
          );
          const box = snappedBoxes[obj.boxIndex];
          return {
            imageUrl: publicUrl,
            boxIndex: obj.boxIndex,
            aspectRatio: obj.aspectRatio,
            geometry: box
              ? { x: box.x, y: box.y, w: box.w, h: box.h }
              : { x: 0, y: 0, w: 30, h: 30 },
          };
        })
      );

      if (!mountedRef.current) return;

      onCreateImages({ croppedObjects: uploadedCropped });
      handleOpenChange(false);
    } catch (err) {
      if (!mountedRef.current) return;
      log.error("handleCreateNewImages", "failed", { error: String(err) });
      toast.error(
        err instanceof Error ? err.message : "Failed to create images"
      );
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  }, [cropResults, selectedCropIndices, onCreateImages, handleOpenChange]);

  // === Selection toggle ===

  const handleToggleSelect = useCallback((boxIndex: number) => {
    setSelectedCropIndices((prev) => {
      const next = new Set(prev);
      if (next.has(boxIndex)) {
        next.delete(boxIndex);
      } else {
        next.add(boxIndex);
      }
      return next;
    });
  }, []);

  // === Keyboard ===

  // Local keyboard handler: Ctrl+Enter (crop) + Arrow nudge for crop boxes.
  // Delete/Backspace and Escape are handled by the interaction layer modal slot above.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isBusy) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleCrop();
        return;
      }
      if (selectedBoxId && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const box = boundingBoxes.find((b) => b.id === selectedBoxId);
        if (!box) return;
        let { x, y } = box;
        if (e.key === "ArrowLeft") x = Math.max(0, x - step);
        if (e.key === "ArrowRight") x = Math.min(100 - box.w, x + step);
        if (e.key === "ArrowUp") y = Math.max(0, y - step);
        if (e.key === "ArrowDown") y = Math.min(100 - box.h, y + step);
        handleBoxUpdate(selectedBoxId, { x, y });
      }
    },
    [isBusy, selectedBoxId, boundingBoxes, handleCrop, handleBoxUpdate]
  );

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as HTMLElement).tagName === "IMG"
    ) {
      setSelectedBoxId(null);
    }
  }, []);

  // === Render ===

  const imageTitle = image.title || "Untitled";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5" />
            Crop Object: {imageTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Image + Bounding Boxes */}
          <div ref={containerRef}>
            {imageUrl && (
              <div className="flex justify-center bg-muted/30 rounded-lg p-2">
                <div
                  ref={imageAreaRef}
                  className="relative select-none"
                  style={{
                    width: imageDisplay ? `${imageDisplay.w}px` : "100%",
                    height: imageDisplay ? `${imageDisplay.h}px` : "auto",
                  }}
                  onClick={handleCanvasClick}
                >
                  <img
                    src={imageUrl}
                    alt="Source image for cropping"
                    className="w-full h-full block"
                    onLoad={handleImageLoad}
                    draggable={false}
                  />

                  {/* Dimmed overlay outside boxes */}
                  {boundingBoxes.length > 0 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <defs>
                        <mask id="crop-dim-mask">
                          <rect width="100%" height="100%" fill="white" />
                          {boundingBoxes.map((box) => (
                            <rect
                              key={box.id}
                              x={`${box.x}%`}
                              y={`${box.y}%`}
                              width={`${box.w}%`}
                              height={`${box.h}%`}
                              fill="black"
                            />
                          ))}
                        </mask>
                      </defs>
                      <rect
                        width="100%"
                        height="100%"
                        fill="rgba(0,0,0,0.3)"
                        mask="url(#crop-dim-mask)"
                      />
                    </svg>
                  )}

                  {/* Loading overlay */}
                  {isCropping && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center pointer-events-none z-30">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">
                          Cropping {boundingBoxes.length} areas...
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bounding Boxes */}
                  {boundingBoxes.map((box, i) => (
                    <BoundingBoxOverlay
                      key={box.id}
                      box={box}
                      index={i}
                      color={BOX_COLORS[i]}
                      isSelected={selectedBoxId === box.id}
                      isLocked={isBusy}
                      onPointerDown={(e, type, corner) =>
                        handlePointerDown(e, box.id, type, corner)
                      }
                      onSelect={() => setSelectedBoxId(box.id)}
                      onDelete={() => handleBoxDelete(box.id)}
                      onRatioChange={(r) => handleRatioChange(box.id, r)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add Crop Area */}
            {!isBusy && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={handleBoxAdd}
                  disabled={boundingBoxes.length >= MAX_BOXES || !imageNatural}
                  className="h-9 px-4 rounded-lg border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                  title={
                    boundingBoxes.length >= MAX_BOXES
                      ? "Maximum 3 crop areas"
                      : undefined
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Crop Area
                </button>
              </div>
            )}
          </div>

          {/* Crop Button */}
          <Button
            onClick={handleCrop}
            disabled={boundingBoxes.length === 0 || isBusy}
            className="w-full"
            size="lg"
          >
            {isCropping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cropping {boundingBoxes.length} areas...
              </>
            ) : (
              <>
                <Crop className="h-4 w-4 mr-2" />
                Crop Image
                {boundingBoxes.length > 0
                  ? ` (${boundingBoxes.length} areas)`
                  : ""}
              </>
            )}
          </Button>

          {/* Result Section */}
          {cropResults && (
            <div ref={resultSectionRef}>
              <CropResultSection
                results={cropResults}
                selectedIndices={selectedCropIndices}
                onToggleSelect={handleToggleSelect}
              />
              <Button
                onClick={handleCreateNewImages}
                disabled={selectedCropIndices.size === 0 || isCreating}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700"
                size="lg"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Create New Images
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Ctrl/Cmd + Enter to crop
        </p>
      </DialogContent>
    </Dialog>
  );
}
