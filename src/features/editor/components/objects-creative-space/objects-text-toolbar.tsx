// objects-text-toolbar.tsx - Floating toolbar for textbox items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Scissors,
  AudioLines,
  Upload,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";
import { uploadAudioToStorage } from "@/apis/storage-api";
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
import { GenerateNarrationModal } from "@/features/editor/components/shared-components";
import type { SpreadTextboxContent, TextboxAudio } from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsTextToolbar");

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

interface ObjectsTextToolbarProps<TSpread extends BaseSpread> {
  context: TextToolbarContext<TSpread>;
}

export function ObjectsTextToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsTextToolbarProps<TSpread>) {
  // --- Refs ---
  const toolbarRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State ---
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // --- Context destructuring ---
  const {
    item,
    onUpdate,
    onDelete,
    onSplitTextbox,
    selectedGeometry,
    canvasRef,
  } = context;

  // --- Hooks ---
  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const editorLangCode = useLanguageCode();
  const langResult = getTextboxContentForLanguage(
    item as unknown as Record<string, unknown>,
    editorLangCode
  );
  const langCode = langResult?.langKey ?? editorLangCode;
  const content = langResult?.content;

  // --- Derived data ---
  const geometry = content?.geometry;
  const audio = content?.audio;
  const hasText = !!content?.text;
  // TODO: use activeVoiceId when available instead of picking first media entry
  const audioUrl = audio?.media[0]?.url ?? null;

  log.debug("render", "toolbar state", {
    itemId: item.id,
    langCode,
    hasGeometry: !!geometry,
    hasAudio: !!audioUrl,
  });

  // --- Geometry change handler ---
  // CRITICAL: geometry lives inside the language content, NOT on the item root
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
      });
    },
    [geometry, content, langCode, onUpdate]
  );

  // --- Audio playback handlers ---
  const handlePlayPause = useCallback(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;

    if (isPlaying) {
      el.pause();
      log.debug("handlePlayPause", "paused narration");
    } else {
      el.play().catch((err) => {
        log.error("handlePlayPause", "play failed", { error: String(err) });
      });
      log.debug("handlePlayPause", "playing narration");
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
      log.debug("handleLoadedMetadata", "audio loaded", {
        duration: el.duration,
      });
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    log.debug("handleEnded", "narration playback ended");
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const time = parseFloat(e.target.value);
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Cleanup: stop audio on unmount
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
      log.info("handleFileChange", "narration upload started", {
        name: file.name,
        size: file.size,
      });

      try {
        const { publicUrl } = await uploadAudioToStorage(
          file,
          "narration-objects"
        );

        // Replace existing uploaded audio (voice_id="") or append if none exists
        const existingMedia = audio?.media ?? [];
        const uploadedIdx = existingMedia.findIndex((m) => !m.voice_id);
        const updatedMedia =
          uploadedIdx >= 0
            ? existingMedia.map((m, i) =>
                i === uploadedIdx ? { voice_id: "", url: publicUrl } : m
              )
            : [...existingMedia, { voice_id: "", url: publicUrl }];

        const updatedAudio: TextboxAudio = {
          script: content?.text ?? "",
          speed: audio?.speed ?? 1,
          emotion: audio?.emotion ?? "neutral",
          media: updatedMedia,
        };

        if (!content) return;
        onUpdate({
          [langCode]: {
            ...content,
            audio: updatedAudio,
          } as SpreadTextboxContent,
        });
        toast.success("Narration uploaded");
        canvasRef.current?.click();
        log.info("handleFileChange", "narration upload success", {
          url: publicUrl,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        log.error("handleFileChange", "narration upload failed", {
          error: message,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [audio, content, langCode, onUpdate, canvasRef]
  );

  // --- Footer action handlers ---
  const handleSplit = useCallback(() => {
    if (onSplitTextbox) {
      log.info("handleSplit", "splitting textbox", { itemId: item.id });
      onSplitTextbox();
    } else {
      toast.info("Split not available");
      log.debug("handleSplit", "split not available — handler missing");
    }
  }, [onSplitTextbox, item.id]);

  // State for GenerateNarrationModal — modal will be wired in Phase 2
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  const handleGenerateNarration = useCallback(() => {
    setIsGenerateModalOpen(true);
    log.info("handleGenerateNarration", "opening generate narration modal", {
      itemId: item.id,
    });
  }, [item.id]);

  // --- Script change handler (syncs modal script → textbox text + marks audio stale) ---
  // Single combined update to avoid race condition between separate text/audio updates
  const handleScriptChange = useCallback(
    (newScript: string) => {
      if (!content) return;
      const updatedContent = { ...content, text: newScript };
      // Mark all audio media as stale when script changes
      if (updatedContent.audio?.media?.length) {
        updatedContent.audio = {
          ...updatedContent.audio,
          script: newScript,
          media: updatedContent.audio.media.map((m) => ({
            ...m,
            script_synced: false,
          })),
        };
      }
      onUpdate({ [langCode]: updatedContent });
      log.info("handleScriptChange", "textbox text + audio stale synced", {
        itemId: item.id,
        langCode,
        staleMediaCount: updatedContent.audio?.media?.length ?? 0,
      });
    },
    [content, langCode, onUpdate, item.id]
  );

  const handleNarrationGenerated = useCallback(
    (narrationAudio: TextboxAudio) => {
      if (!content) return;
      onUpdate({ [langCode]: { ...content, audio: narrationAudio } });
      // Don't close modal here — let user close explicitly to avoid state-update race
      log.info("handleNarrationGenerated", "narration audio updated", {
        itemId: item.id,
        mediaCount: narrationAudio.media.length,
      });
    },
    [content, langCode, onUpdate, item.id]
  );

  // --- Positioning style ---
  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  // --- SSR guard ---
  if (typeof document === "undefined") return null;

  // --- Render ---
  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="text"
        role="toolbar"
        aria-label="Text formatting toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Geometry Section — fallback to zeros when no content for current language */}
        <GeometrySection
          geometry={geometry ?? { x: 0, y: 0, w: 0, h: 0 }}
          onGeometryChange={handleGeometryChange}
        />

        {/* Narration Section */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase font-semibold">
            Narration
          </Label>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              disabled={!audioUrl}
              aria-label={isPlaying ? "Pause narration" : "Play narration"}
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
              aria-label="Narration progress"
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

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Scissors}
              label="Split textbox"
              onClick={handleSplit}
            />
            <ToolbarIconButton
              icon={AudioLines}
              label={
                hasText ? "Generate narration" : "No text for current language"
              }
              onClick={handleGenerateNarration}
              disabled={!hasText}
            />
            <ToolbarIconButton
              icon={Upload}
              label={
                !hasText
                  ? "No text for current language"
                  : isUploading
                  ? "Uploading..."
                  : "Upload narration"
              }
              onClick={handleUploadClick}
              disabled={isUploading || !hasText}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete textbox"
            onClick={onDelete}
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

        {isGenerateModalOpen && (
          <GenerateNarrationModal
            isOpen={isGenerateModalOpen}
            onClose={() => setIsGenerateModalOpen(false)}
            script={content?.text ?? ""}
            existingAudio={audio}
            onGenerated={handleNarrationGenerated}
            onScriptChange={handleScriptChange}
          />
        )}
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
