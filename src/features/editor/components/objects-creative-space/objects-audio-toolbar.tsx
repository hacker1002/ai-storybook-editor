// objects-audio-toolbar.tsx - Floating toolbar for audio / auto_audio items on canvas in Objects Creative Space
"use client";

import { useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FolderOpen, Pencil, Trash2 } from "lucide-react";

import {
  useToolbarPosition,
  type BaseSpread,
  type AudioToolbarContext,
  type AutoAudioToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import type { SpreadAudio, SpreadAutoAudio } from "@/types/spread-types";
import { ToolbarIconButton } from "@/features/editor/components/shared-components";
import { InlineAudioPlayer } from "@/components/audio/inline-audio-player";
import { loadAudioMetadata } from "@/features/editor/utils/load-audio-metadata";

const log = createLogger("Editor", "ObjectsAudioToolbar");

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

type ToolbarVariant = "audio" | "auto_audio";

interface VariantConfig {
  captureMediaLength: boolean;
  dataToolbar: ToolbarVariant;
  ariaLabel: string;
}

const VARIANT_CONFIG: Record<ToolbarVariant, VariantConfig> = {
  audio: {
    captureMediaLength: true,
    dataToolbar: "audio",
    ariaLabel: "Audio formatting toolbar",
  },
  auto_audio: {
    captureMediaLength: false,
    dataToolbar: "auto_audio",
    ariaLabel: "Auto-audio formatting toolbar",
  },
};

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

  const toolbarRef = useRef<HTMLDivElement>(null);

  const { item, onUpdate, onDelete, onBrowseSound, onEditAudio, selectedGeometry, canvasRef } =
    context;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

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

  const handleDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  const toolbarStyle: React.CSSProperties = position
    ? { position: "fixed", top: `${position.top}px`, left: `${position.left}px` }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar={cfg.dataToolbar}
        role="toolbar"
        aria-label={cfg.ariaLabel}
        className="min-w-[360px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        {/* Audio Playback (no label) */}
        <div>
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
              icon={FolderOpen}
              label="Browse sound library"
              onClick={onBrowseSound}
            />
            <ToolbarIconButton
              icon={Pencil}
              label="Edit audio"
              onClick={onEditAudio}
              disabled={!audioUrl || !onEditAudio}
            />
          </div>
          <ToolbarIconButton
            icon={Trash2}
            label="Delete audio"
            onClick={handleDelete}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}

// Re-export type used by callers that destructure SpreadAutoAudio
export type { SpreadAutoAudio };
