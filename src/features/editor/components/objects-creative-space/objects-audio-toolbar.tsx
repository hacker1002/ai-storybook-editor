// objects-audio-toolbar.tsx - Floating toolbar for audio items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Play, Pause, Scissors } from "lucide-react";
import { toast } from "sonner";
import { uploadAudioToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  type BaseSpread,
  type AudioToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type { SpreadItemMediaType } from "@/types/spread-types";
import {
  clampGeometry,
  GeometrySection,
  MediaIdentitySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "ObjectsAudioToolbar");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ObjectsAudioToolbarProps<TSpread extends BaseSpread> {
  context: AudioToolbarContext<TSpread>;
}

export function ObjectsAudioToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsAudioToolbarProps<TSpread>) {
  // --- Refs ---
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- State ---
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // --- Context ---
  const { item, onUpdate, onDelete, onCropAudio, selectedGeometry, canvasRef } = context;
  const { geometry } = item;

  // --- Positioning ---
  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  // --- Derived values ---
  const currentType = (item.type ?? "raw") as SpreadItemMediaType;
  const currentName = item.name ?? "";
  const currentState = item.variant ?? "default";
  const audioUrl = item.media_url ?? null;

  // --- Type / Name / State handlers ---
  const handleTypeChange = useCallback(
    (newType: string) => {
      log.debug("handleTypeChange", "type change", { from: currentType, to: newType });
      onUpdate({ type: newType as SpreadItemMediaType, name: undefined, variant: undefined });
    },
    [currentType, onUpdate]
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      log.debug("handleNameChange", "name change", { name: newName });
      onUpdate({ name: newName });
    },
    [onUpdate]
  );

  const handleStateChange = useCallback(
    (newState: string) => {
      log.debug("handleStateChange", "state change", { variant: newState });
      onUpdate({ variant: newState });
    },
    [onUpdate]
  );

  // --- Geometry handler ---
  const handleGeometryChange = useCallback(
    (field: "x" | "y" | "w" | "h", value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      let clamped = clampGeometry(field, numValue);
      if (field === "x") clamped = Math.min(clamped, 200 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 200 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 200 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 200 - geometry.y);
      log.debug("handleGeometryChange", "geometry change", { field, value: clamped });
      onUpdate({ geometry: { ...geometry, [field]: clamped } });
    },
    [geometry, onUpdate]
  );

  // --- Audio playback handlers ---
  const handlePlayPause = useCallback(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;

    if (isPlaying) {
      el.pause();
      log.debug("handlePlayPause", "paused");
    } else {
      el.play().catch((err) => {
        log.error("handlePlayPause", "play failed", { error: String(err) });
      });
      log.debug("handlePlayPause", "playing");
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl]);

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (el) setCurrentTime(el.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      setDuration(el.duration);
      log.debug("handleLoadedMetadata", "audio loaded", { duration: el.duration });
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    log.debug("handleEnded", "playback ended");
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const time = parseFloat(e.target.value);
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Reset playback state when audio source changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [audioUrl]);

  // Stop audio on unmount
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
    };
  }, []);

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
      log.info("handleFileChange", "upload started", { name: file.name, size: file.size });

      try {
        const { publicUrl } = await uploadAudioToStorage(file, "audio-objects");
        onUpdate({ media_url: publicUrl });
        toast.success("Audio uploaded");
        log.info("handleFileChange", "upload success", { url: publicUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("handleFileChange", "upload failed", { error: message });
      } finally {
        setIsUploading(false);
      }
    },
    [onUpdate]
  );

  // --- Delete handler: stop audio first ---
  const handleDelete = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    onDelete();
  }, [onDelete]);

  // --- Positioning style ---
  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="audio"
        role="toolbar"
        aria-label="Audio formatting toolbar"
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

        {/* Geometry */}
        <GeometrySection
          geometry={geometry}
          onGeometryChange={handleGeometryChange}
        />

        {/* Audio Playback */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase font-semibold">
            Audio Playback
          </Label>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              disabled={!audioUrl}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
              className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              disabled={!audioUrl}
              aria-label="Audio progress"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
              {formatTime(currentTime)}
            </span>
          </div>
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            className="hidden"
          />
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
