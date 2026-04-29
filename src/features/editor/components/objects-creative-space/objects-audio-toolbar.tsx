// objects-audio-toolbar.tsx - Floating toolbar for audio / auto_audio items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { uploadAudioToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  type BaseSpread,
  type AudioToolbarContext,
  type AutoAudioToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type {
  SpreadItemMediaType,
  SpreadAudio,
  SpreadAutoAudio,
} from "@/types/spread-types";
import type { Geometry } from "@/types/canvas-types";
import {
  clampGeometry,
  GeometrySection,
  MediaIdentitySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { InlineAudioPlayer } from "@/features/voices/components/voice-preview/inline-audio-player";
import { loadAudioMetadata } from "@/features/editor/utils/load-audio-metadata";

const log = createLogger("Editor", "ObjectsAudioToolbar");

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

type ToolbarVariant = "audio" | "auto_audio";

interface VariantConfig {
  defaultType: SpreadItemMediaType;
  showBehaviorBadge: boolean;
  captureMediaLength: boolean;
  playbackLabel: string;
  dataToolbar: ToolbarVariant;
  ariaLabel: string;
}

const VARIANT_CONFIG: Record<ToolbarVariant, VariantConfig> = {
  audio: {
    defaultType: "raw",
    showBehaviorBadge: false,
    captureMediaLength: true,
    playbackLabel: "Audio Playback",
    dataToolbar: "audio",
    ariaLabel: "Audio formatting toolbar",
  },
  auto_audio: {
    defaultType: "background",
    showBehaviorBadge: true,
    captureMediaLength: false,
    playbackLabel: "Audio Playback",
    dataToolbar: "auto_audio",
    ariaLabel: "Auto-audio formatting toolbar",
  },
};

// ---------------------------------------------------------------------------
// BehaviorBadge — auto_audio only
// ---------------------------------------------------------------------------

function BehaviorBadge() {
  return (
    <div
      className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground"
      role="status"
      aria-label="Auto-audio behavior: auto-play, loop, hidden in player"
    >
      <span className="font-semibold uppercase">Behavior:</span>{" "}
      <span>◉ AUTO · LOOP · HIDDEN IN PLAYER</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ObjectsAudioToolbarProps<TSpread extends BaseSpread> {
  context:
    | AudioToolbarContext<TSpread>
    | AutoAudioToolbarContext<TSpread>;
  /** Toolbar variant — defaults to "audio". Use "auto_audio" for auto-playing background audio items. */
  variant?: ToolbarVariant;
}

export function ObjectsAudioToolbar<TSpread extends BaseSpread>({
  context,
  variant = "audio",
}: ObjectsAudioToolbarProps<TSpread>) {
  const cfg = VARIANT_CONFIG[variant];

  // --- Refs ---
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State ---
  const [isUploading, setIsUploading] = useState(false);

  // --- Context ---
  const { item, onUpdate, onDelete, onCropAudio, selectedGeometry, canvasRef } =
    context;
  const { geometry } = item;

  // --- Positioning ---
  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  // --- Derived values ---
  const currentType = (item.type ?? cfg.defaultType) as SpreadItemMediaType;
  const currentName = item.name ?? "";
  const currentState = item.variant ?? "default";
  const audioUrl = item.media_url ?? null;
  // media_length only exists on SpreadAudio; auto_audio omits the field.
  const mediaLength =
    variant === "audio" ? (item as SpreadAudio).media_length ?? 0 : 0;

  // --- Lazy backfill media_length for legacy audio items (audio variant only) ---
  useEffect(() => {
    if (!cfg.captureMediaLength) return;
    if (!audioUrl) return;
    if (mediaLength > 0) return;

    log.info("backfill", "audio media_length backfill triggered", {
      audioId: item.id,
    });
    let cancelled = false;
    void loadAudioMetadata(audioUrl).then((ms) => {
      if (cancelled) return;
      if (!ms) {
        log.debug("backfill", "load fail", { audioId: item.id });
        return;
      }
      log.debug("backfill", "load OK via toolbar", { audioId: item.id, ms });
      // Cast to Partial<SpreadAudio> — only invoked when variant === 'audio'.
      (onUpdate as (u: Partial<SpreadAudio>) => void)({ media_length: ms });
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl, mediaLength, item.id, onUpdate, cfg.captureMediaLength]);

  // --- Type / Name / State handlers ---
  const handleTypeChange = useCallback(
    (newType: string) => {
      log.debug("handleTypeChange", "type change", {
        from: currentType,
        to: newType,
        variant,
      });
      (onUpdate as (u: Record<string, unknown>) => void)({
        type: newType as SpreadItemMediaType,
        name: undefined,
        variant: undefined,
      });
    },
    [currentType, onUpdate, variant]
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      log.debug("handleNameChange", "name change", { name: newName, variant });
      (onUpdate as (u: Record<string, unknown>) => void)({ name: newName });
    },
    [onUpdate, variant]
  );

  const handleStateChange = useCallback(
    (newState: string) => {
      log.debug("handleStateChange", "state change", {
        variant: newState,
        toolbar: variant,
      });
      (onUpdate as (u: Record<string, unknown>) => void)({ variant: newState });
    },
    [onUpdate, variant]
  );

  // --- Geometry handler — auto_audio only commits x/y; audio commits all 4 fields ---
  const handleGeometryChange = useCallback(
    (field: keyof Geometry, value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      // auto_audio data is 2D ({x,y} only) — silently ignore w/h edits
      if (variant === "auto_audio" && (field === "w" || field === "h")) {
        log.debug("handleGeometryChange", "skip w/h for auto_audio", { field });
        return;
      }
      let clamped = clampGeometry(field, numValue);
      const g = geometry as Geometry;
      if (field === "x") clamped = Math.min(clamped, 200 - (g.w ?? 0));
      if (field === "y") clamped = Math.min(clamped, 200 - (g.h ?? 0));
      if (field === "w") clamped = Math.min(clamped, 200 - g.x);
      if (field === "h") clamped = Math.min(clamped, 200 - g.y);
      log.debug("handleGeometryChange", "geometry change", {
        field,
        value: clamped,
        variant,
      });
      if (variant === "auto_audio") {
        // commit only the changed coord — leave other coord untouched
        (onUpdate as (u: Record<string, unknown>) => void)({
          geometry: { x: g.x, y: g.y, [field]: clamped },
        });
      } else {
        (onUpdate as (u: Record<string, unknown>) => void)({
          geometry: { ...g, [field]: clamped },
        });
      }
    },
    [geometry, onUpdate, variant]
  );

  // --- Upload handler ---
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setIsUploading(true);
      log.info("handleFileChange", "upload started", {
        name: file.name,
        size: file.size,
        variant,
      });

      try {
        const { publicUrl } = await uploadAudioToStorage(file, "audio-objects");
        (onUpdate as (u: Record<string, unknown>) => void)({
          media_url: publicUrl,
        });
        toast.success("Audio uploaded");
        log.info("handleFileChange", "upload success", {
          url: publicUrl,
          variant,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("handleFileChange", "upload failed", {
          error: message,
          variant,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [onUpdate, variant]
  );

  // --- Delete handler ---
  const handleDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  // --- Positioning style ---
  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  // Display geometry in 4D for both variants so auto_audio toolbar matches
  // audio toolbar visually. For auto_audio (2D data), synthesize w/h=0; w/h
  // edits are ignored by handleGeometryChange.
  const displayGeometry: Geometry =
    variant === "auto_audio"
      ? {
          x: (geometry as { x: number; y: number }).x,
          y: (geometry as { x: number; y: number }).y,
          w: 0,
          h: 0,
        }
      : (geometry as Geometry);

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar={cfg.dataToolbar}
        role="toolbar"
        aria-label={cfg.ariaLabel}
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Type, Name, State */}
        <MediaIdentitySection
          type={currentType}
          name={currentName}
          state={currentState}
          onTypeChange={handleTypeChange}
          onNameChange={handleNameChange}
          onStateChange={handleStateChange}
          mediaLabel="Audio"
        />

        {/* Behavior badge — auto_audio only */}
        {cfg.showBehaviorBadge && <BehaviorBadge />}

        {/* Geometry */}
        <GeometrySection
          geometry={displayGeometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* Audio Playback */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase font-semibold">
            {cfg.playbackLabel}
          </Label>
          {audioUrl ? (
            <InlineAudioPlayer
              key={audioUrl}
              src={audioUrl}
              isActive
              onPlayStart={() => {}}
              className="border-0 px-0 py-0"
            />
          ) : (
            <div className="flex h-10 items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 text-xs text-muted-foreground">
              No audio
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Upload}
              label={isUploading ? "Uploading..." : "Upload audio"}
              onClick={handleUploadClick}
              disabled={isUploading}
            />
            <ToolbarIconButton
              icon={Scissors}
              label="Crop audio"
              onClick={onCropAudio}
              disabled={!audioUrl || !onCropAudio}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete audio"
            onClick={handleDelete}
            variant="destructive"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/aac"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}

// Re-export type used by callers that destructure SpreadAutoAudio
export type { SpreadAutoAudio };
