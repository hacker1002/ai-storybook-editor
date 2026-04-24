// objects-text-toolbar.tsx - Floating toolbar for textbox items on canvas in Objects Creative Space
"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Scissors,
  AudioLines,
  Upload,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { uploadAudioToStorage } from "@/apis/storage-api";
import {
  useToolbarPosition,
  type BaseSpread,
  type TextToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import { InlineAudioPlayer } from "@/features/voices/components/voice-preview/inline-audio-player";
import {
  clampGeometry,
  GeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import {
  GenerateNarrationModal,
  DEFAULT_SETTINGS,
  probeAudioDuration,
  sha256HexOfFile,
} from "@/features/editor/components/shared-components/generate-narration-modal";
import type {
  SpreadTextboxContent,
  TextboxAudio,
  TextboxAudioMedia,
  TextboxAudioSettings,
} from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsTextToolbar");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State ---
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  // --- Context destructuring ---
  const {
    item,
    onUpdate,
    onDelete,
    onSplitTextbox,
    onEditText,
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
  const audioUrl = audio?.media?.url ?? null;
  const isStale = audio?.media != null && !audio.media.script_synced;

  log.debug("render", "toolbar state", {
    itemId: item.id,
    langCode,
    hasAudio: !!audioUrl,
    isStale,
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
      if (field === "x") clamped = Math.min(clamped, 200 - geometry.w);
      if (field === "y") clamped = Math.min(clamped, 200 - geometry.h);
      if (field === "w") clamped = Math.min(clamped, 200 - geometry.x);
      if (field === "h") clamped = Math.min(clamped, 200 - geometry.y);

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
        const [{ publicUrl }, durationMs, fileHash] = await Promise.all([
          uploadAudioToStorage(file, "narration-objects"),
          probeAudioDuration(file),
          sha256HexOfFile(file),
        ]);

        const newMedia: TextboxAudioMedia = {
          url: publicUrl,
          duration_ms: durationMs,
          output_format: "user-uploaded",
          path_key: `upload:${fileHash}`,
          script_synced: true, // user takes responsibility for match
          generated_at: new Date().toISOString(),
          segments: [],
          raw_alignment: {
            characters: [],
            character_start_times_seconds: [],
            character_end_times_seconds: [],
          },
        };

        const existingAudio = content?.audio;
        const newAudio: TextboxAudio = {
          script: existingAudio?.script ?? content?.text ?? "",
          settings: existingAudio?.settings ?? DEFAULT_SETTINGS,
          media: newMedia,
        };

        if (!content) return;
        // Single atomic onUpdate — no separate text/audio calls
        onUpdate({
          [langCode]: {
            ...content,
            audio: newAudio,
          } as SpreadTextboxContent,
        });
        toast.success("Narration uploaded");
        canvasRef.current?.click();
        log.info("handleFileChange", "narration upload success", {
          url: publicUrl,
          durationMs,
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
    [content, langCode, onUpdate, canvasRef]
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

  const handleGenerateNarration = useCallback(() => {
    setIsGenerateModalOpen(true);
    log.info("handleGenerateNarration", "opening generate narration modal", {
      itemId: item.id,
    });
  }, [item.id]);

// --- Narration generated handler (persist; keep modal open for further edits) ---
  const handleNarrationGenerated = useCallback(
    (narrationAudio: TextboxAudio) => {
      if (!content) return;
      onUpdate({
        [langCode]: { ...content, audio: narrationAudio } as SpreadTextboxContent,
      });
      log.info("handleNarrationGenerated", "narration audio updated", {
        itemId: item.id,
        hasMedia: narrationAudio.media != null,
      });
    },
    [content, langCode, onUpdate, item.id]
  );

  // --- Draft save handler (persist unfinalized script/settings edits on close) ---
  const handleDraftSave = useCallback(
    (draft: { script: string; settings: TextboxAudioSettings }) => {
      if (!content) return;
      const prev = content.audio;
      const nextAudio: TextboxAudio = {
        script: draft.script,
        settings: draft.settings,
        media: prev?.media
          ? { ...prev.media, script_synced: false }
          : null,
      };
      onUpdate({
        [langCode]: { ...content, audio: nextAudio } as SpreadTextboxContent,
      });
      log.debug("handleDraftSave", "persisted draft edits", {
        itemId: item.id,
        hasMedia: nextAudio.media != null,
      });
    },
    [content, langCode, onUpdate, item.id]
  );

  // --- Mark-stale handler (modal script/settings edits → flip script_synced) ---
  const handleMarkStale = useCallback(() => {
    if (!content?.audio?.media) return;
    if (content.audio.media.script_synced === false) return;
    const updated: SpreadTextboxContent = {
      ...content,
      audio: {
        ...content.audio,
        media: { ...content.audio.media, script_synced: false },
      },
    };
    onUpdate({ [langCode]: updated });
    log.debug("handleMarkStale", "flipped script_synced=false", {
      itemId: item.id,
    });
  }, [content, langCode, onUpdate, item.id]);

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
        data-toolbar="textbox"
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
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase font-semibold">
              Narration
            </Label>
            {isStale && (
              <span
                className="text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                title="Script changed — re-generate to refresh narration"
              >
                Stale
              </span>
            )}
          </div>
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
              No narration audio
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              icon={Pencil}
              label="Edit text"
              onClick={onEditText}
              disabled={!onEditText}
            />
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
            textboxText={content?.text ?? ""}
            existingAudio={audio ?? null}
            currentLanguage={langCode}
            onGenerated={handleNarrationGenerated}
            onMarkStale={handleMarkStale}
            onDraftSave={handleDraftSave}
          />
        )}
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
