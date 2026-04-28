// objects-auto-pic-toolbar.tsx - Floating toolbar for auto_pic items in Objects Creative Space
// Differences from video toolbar: no playback, aspect-locked W/H post-upload, W/H disabled pre-upload,
// variant as free-text, upload accept webp+webm+lottie+riv (.gif blocked — validation session 1)
"use client";

import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Upload, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { uploadAutoPicToStorage } from "@/apis/storage-api";
import {
  inspectLottie,
  inspectRive,
  inspectLottieFromUrl,
  inspectRiveFromUrl,
  type LottieInspection,
  type RiveInspection,
} from "@/features/editor/components/shared-components/auto-pic-players/inspect-auto-pic";
import {
  useToolbarPosition,
  type BaseSpread,
  type AutoPicToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
import { createLogger } from "@/utils/logger";
import type { SpreadItemMediaType } from "@/types/spread-types";
import {
  clampGeometry,
  computeGeometryOnMediaReplace,
  GeometryInput,
  ToolbarIconButton,
  MEDIA_TYPE_OPTIONS,
} from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "ObjectsAutoPicToolbar");

// .gif blocked client-side — validation session 1
// .lottie/.riv validated by extension only (MIME unreliable — browser returns application/octet-stream)
const AUTO_PIC_ACCEPT = "image/webp,video/webm,.lottie,.riv";
const VALID_MIME_TYPES = ["image/webp", "video/webm"];

function isValidAutoPicFile(file: File): boolean {
  if (VALID_MIME_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".lottie") || name.endsWith(".riv");
}

function detectImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = url;
  });
}

function detectVideoDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read video dimensions"));
    };
    video.src = url;
  });
}

type DerivedMediaKind = "webp" | "webm" | "lottie" | "riv" | null;

function deriveMediaKind(mediaUrl: string | undefined): DerivedMediaKind {
  if (!mediaUrl) return null;
  const ext = mediaUrl.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "webm") return "webm";
  if (ext === "webp") return "webp";
  if (ext === "lottie") return "lottie";
  if (ext === "riv") return "riv";
  return null;
}

// "__none__" used as Select sentinel since SelectItem cannot have empty-string value
const NONE_VALUE = "__none__";

interface ObjectsAutoPicToolbarProps<TSpread extends BaseSpread> {
  context: AutoPicToolbarContext<TSpread>;
}

export function ObjectsAutoPicToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsAutoPicToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const { item, onUpdate, onDelete, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  // hasMedia gates W/H inputs and aspect-lock (validation session 1)
  const hasMedia = !!item.media_url;
  const mediaKind = useMemo(() => deriveMediaKind(item.media_url), [item.media_url]);

  // Inspection metadata — populated on upload (fresh inspect) or on mount for existing
  // items (lazy fetch+probe from stored URL, with module-level cache).
  const [riveMeta, setRiveMeta] = useState<RiveInspection | null>(null);
  const [lottieMeta, setLottieMeta] = useState<LottieInspection | null>(null);

  useEffect(() => {
    if (!item.media_url) {
      setRiveMeta(null);
      setLottieMeta(null);
      return;
    }
    const url = item.media_url;
    let cancelled = false;
    if (mediaKind === "riv") {
      inspectRiveFromUrl(url)
        .then((m) => { if (!cancelled) setRiveMeta(m); })
        .catch((err) => {
          log.warn("useEffect", "rive inspect-from-url failed", { error: String(err) });
          if (!cancelled) setRiveMeta(null);
        });
    } else if (mediaKind === "lottie") {
      inspectLottieFromUrl(url)
        .then((m) => { if (!cancelled) setLottieMeta(m); })
        .catch((err) => {
          log.warn("useEffect", "lottie inspect-from-url failed", { error: String(err) });
          if (!cancelled) setLottieMeta(null);
        });
    } else {
      setRiveMeta(null);
      setLottieMeta(null);
    }
    return () => { cancelled = true; };
  }, [item.media_url, mediaKind]);
  // Aspect ratio derived from stored geometry — set accurately on upload, so ratio persists
  const aspectRatio = useMemo(
    () => (hasMedia && geometry.h > 0 ? geometry.w / geometry.h : null),
    [hasMedia, geometry.w, geometry.h]
  );

  const currentType = (item.type ?? "raw") as SpreadItemMediaType;
  const currentName = item.name ?? "";
  const currentVariant = item.variant ?? "";
  const showNameVariant = currentType !== "raw" && currentType !== "other";

  const handleTypeChange = useCallback(
    (newType: string) => {
      log.debug("handleTypeChange", "type change", { from: currentType, to: newType });
      onUpdate({ type: newType as SpreadItemMediaType, name: undefined, variant: undefined });
    },
    [currentType, onUpdate]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      log.debug("handleNameChange", "name change", { name: e.target.value });
      onUpdate({ name: e.target.value });
    },
    [onUpdate]
  );

  const handleVariantChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      log.debug("handleVariantChange", "variant change", { variant: e.target.value });
      onUpdate({ variant: e.target.value });
    },
    [onUpdate]
  );

  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      // W/H blocked pre-upload (defensive — inputs are visually disabled too)
      if ((field === "w" || field === "h") && !hasMedia) return;

      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 200 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 200 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 200 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 200 - geometry.y);

      if (aspectRatio !== null) {
        if (field === "w") {
          const newH = clampGeometry("h", Math.min(clamped / aspectRatio, 200 - geometry.y));
          log.debug("handleGeometryChange", "aspect-locked W→H", { w: clamped, h: newH });
          onUpdate({ geometry: { ...geometry, w: clamped, h: newH } });
          return;
        }
        if (field === "h") {
          const newW = clampGeometry("w", Math.min(clamped * aspectRatio, 200 - geometry.x));
          log.debug("handleGeometryChange", "aspect-locked H→W", { w: newW, h: clamped });
          onUpdate({ geometry: { ...geometry, w: newW, h: clamped } });
          return;
        }
      }

      log.debug("handleGeometryChange", "update", { field, value: clamped });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, hasMedia, aspectRatio, onUpdate]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!isValidAutoPicFile(file)) {
        toast.error(
          "Please use .webp, .webm, .lottie, or .riv format. .gif is not supported."
        );
        log.warn("handleFileChange", "rejected invalid type", { type: file.type, name: file.name });
        return;
      }

      setIsUploading(true);
      log.info("handleFileChange", "upload started", {
        picId: item.id,
        name: file.name,
        size: file.size,
        type: file.type,
      });

      try {
        const lowerName = file.name.toLowerCase();
        const isLottie = lowerName.endsWith(".lottie");
        const isRive = lowerName.endsWith(".riv");

        type Probe =
          | { kind: "image" | "video"; dims: { width: number; height: number } }
          | { kind: "lottie"; inspection: LottieInspection }
          | { kind: "rive"; inspection: RiveInspection }
          | null;

        const probePromise: Promise<Probe> =
          file.type === "image/webp"
            ? detectImageDimensions(file).then((d) => ({ kind: "image" as const, dims: d })).catch(() => null)
            : file.type === "video/webm"
            ? detectVideoDimensions(file).then((d) => ({ kind: "video" as const, dims: d })).catch(() => null)
            : isLottie
            ? inspectLottie(file).then((i) => ({ kind: "lottie" as const, inspection: i })).catch((err) => {
                log.warn("handleFileChange", "lottie inspect failed", { error: String(err) });
                return null;
              })
            : isRive
            ? inspectRive(file).then((i) => ({ kind: "rive" as const, inspection: i })).catch((err) => {
                log.warn("handleFileChange", "rive inspect failed", { error: String(err) });
                return null;
              })
            : Promise.resolve(null);

        const [{ publicUrl }, probe] = await Promise.all([
          uploadAutoPicToStorage(file, "auto-pics"),
          probePromise,
        ]);

        const dims = probe && "inspection" in probe
          ? { width: probe.inspection.width, height: probe.inspection.height }
          : probe && "dims" in probe
          ? probe.dims
          : null;

        const updates: Parameters<typeof onUpdate>[0] = { media_url: publicUrl };

        if (dims) {
          log.debug("handleFileChange", "detected dimensions", {
            kind: file.type || lowerName.split(".").pop(),
            w: dims.width,
            h: dims.height,
          });
          updates.geometry = computeGeometryOnMediaReplace({
            old: geometry,
            naturalW: dims.width,
            naturalH: dims.height,
            canvasW: canvasWidth,
            canvasH: canvasHeight,
          });
        }

        // Auto-select first state machine when present → item becomes interactive by default.
        // User can clear via dropdown to fall back to linear animation.
        if (probe?.kind === "rive") {
          setRiveMeta(probe.inspection);
          const autoSm = probe.inspection.stateMachines[0];
          updates.rive = {
            ...(item.rive ?? {}),
            ...(autoSm ? { state_machine: autoSm } : {}),
          };
        } else if (probe?.kind === "lottie") {
          setLottieMeta(probe.inspection);
          const autoSm = probe.inspection.stateMachines[0];
          updates.lottie = {
            ...(item.lottie ?? {}),
            ...(autoSm ? { state_machine: autoSm } : {}),
          };
        }

        onUpdate(updates);

        toast.success("Animated pic uploaded");
        canvasRef.current?.click();
        log.info("handleFileChange", "upload success", { picId: item.id, name: file.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("handleFileChange", "upload failed", {
          picId: item.id,
          error: message,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [geometry, item.id, item.rive, item.lottie, onUpdate, canvasRef, canvasWidth, canvasHeight]
  );

  // === Interactivity config handlers ===

  const handleRiveStateMachineChange = useCallback(
    (value: string) => {
      const next = value === NONE_VALUE ? undefined : value;
      log.debug("handleRiveStateMachineChange", "select", { value: next });
      onUpdate({ rive: { ...(item.rive ?? {}), state_machine: next } });
    },
    [item.rive, onUpdate],
  );

  const handleLottieStateMachineChange = useCallback(
    (value: string) => {
      const next = value === NONE_VALUE ? undefined : value;
      log.debug("handleLottieStateMachineChange", "select", { value: next });
      onUpdate({ lottie: { ...(item.lottie ?? {}), state_machine: next } });
    },
    [item.lottie, onUpdate],
  );

  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="auto_pic"
        role="toolbar"
        aria-label="Animated pic formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Row 1: Type */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Type
          </Label>
          <Select value={currentType} onValueChange={handleTypeChange}>
            <SelectTrigger
              className="h-7 text-sm flex-1"
              aria-label="Animated pic type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIA_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Name + Variant (free-text — validation session 1, not dropdown) */}
        {showNameVariant && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14 shrink-0">
              Name
            </Label>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                type="text"
                value={currentName}
                onChange={handleNameChange}
                placeholder="Enter name..."
                aria-label="Animated pic name"
                className="h-7 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={currentVariant}
                onChange={handleVariantChange}
                placeholder="variant"
                aria-label="Animated pic variant"
                className="h-7 w-24 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Row 3: MediaKind badge (read-only, derived from media_url extension) */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Media
          </Label>
          <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
            {mediaKind ?? "—"}
          </span>
        </div>

        {/* Row 3b: Interactivity — Rive state machine (present → item is interactive in play mode) */}
        {mediaKind === "riv" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14 shrink-0">
              State
            </Label>
            <Select
              value={item.rive?.state_machine ?? NONE_VALUE}
              onValueChange={handleRiveStateMachineChange}
              disabled={!riveMeta || riveMeta.stateMachines.length === 0}
            >
              <SelectTrigger className="h-7 text-sm flex-1" aria-label="Rive state machine">
                <SelectValue placeholder={riveMeta ? "No state machine" : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None (linear)</SelectItem>
                {riveMeta?.stateMachines.map((sm) => (
                  <SelectItem key={sm} value={sm}>{sm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Row 3c: Interactivity — Lottie state machine */}
        {mediaKind === "lottie" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-14 shrink-0">
              State
            </Label>
            <Select
              value={item.lottie?.state_machine ?? NONE_VALUE}
              onValueChange={handleLottieStateMachineChange}
              disabled={!lottieMeta || lottieMeta.stateMachines.length === 0}
            >
              <SelectTrigger className="h-7 text-sm flex-1" aria-label="Lottie state machine">
                <SelectValue placeholder={lottieMeta ? "No state machine" : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None (linear)</SelectItem>
                {lottieMeta?.stateMachines.map((sm) => (
                  <SelectItem key={sm} value={sm}>{sm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Row 4-5: Geometry — W/H disabled pre-upload, aspect-locked post-upload */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">
            Geometry
          </Label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-14">
                Position
              </Label>
              <GeometryInput
                label="X"
                value={geometry.x}
                onChange={(v) => handleGeometryChange("x", v)}
                ariaLabel="Position X"
              />
              <GeometryInput
                label="Y"
                value={geometry.y}
                onChange={(v) => handleGeometryChange("y", v)}
                ariaLabel="Position Y"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-14">
                Size
              </Label>
              {hasMedia ? (
                <>
                  <GeometryInput
                    label="W"
                    value={geometry.w}
                    onChange={(v) => handleGeometryChange("w", v)}
                    ariaLabel="Size W"
                  />
                  <Lock className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden />
                  <GeometryInput
                    label="H"
                    value={geometry.h}
                    onChange={(v) => handleGeometryChange("h", v)}
                    ariaLabel="Size H"
                  />
                </>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 opacity-50 cursor-not-allowed select-none">
                      <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
                        <span className="px-2 text-sm text-muted-foreground border-r border-border">
                          W
                        </span>
                        <span className="w-12 px-1 text-sm text-center text-muted-foreground">
                          {Math.round(geometry.w)}
                        </span>
                        <span className="px-1.5 text-sm text-muted-foreground border-l border-border">
                          %
                        </span>
                      </div>
                      <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
                        <span className="px-2 text-sm text-muted-foreground border-r border-border">
                          H
                        </span>
                        <span className="w-12 px-1 text-sm text-center text-muted-foreground">
                          {Math.round(geometry.h)}
                        </span>
                        <span className="px-1.5 text-sm text-muted-foreground border-l border-border">
                          %
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Upload media to resize
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Upload}
              label={isUploading ? "Uploading..." : "Upload animated pic"}
              onClick={handleUploadClick}
              disabled={isUploading}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete animated pic"
            onClick={onDelete}
            variant="destructive"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={AUTO_PIC_ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
