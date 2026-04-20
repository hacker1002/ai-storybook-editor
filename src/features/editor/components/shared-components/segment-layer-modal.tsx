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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MousePointerSquareDashed, Loader2, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import { callSegmentLayer, SegmentLayerError } from "@/apis/retouch-api";
import type { SpreadImage } from "@/types/spread-types";

const log = createLogger("UI", "SegmentLayerModal");

function resolveImageUrl(image: SpreadImage): string | undefined {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((i) => i.is_selected);
  if (selected) return selected.media_url;
  if (image.illustrations?.[0]) return image.illustrations[0].media_url;
  return image.media_url;
}

// === Types ===

export interface SegmentResult {
  id: string;
  media_url: string;
  prompt: string;
  coverageRatio?: number;
}

export interface SegmentLayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onCreateSegment: (segment: SegmentResult) => void;
  yieldedFrom?: {
    parentId: string;
    onParentForcePop: () => void;
  };
}

// === Component ===

export function SegmentLayerModal({
  open,
  onOpenChange,
  image,
  onCreateSegment,
  yieldedFrom,
}: SegmentLayerModalProps) {
  const [prompt, setPrompt] = useState("");
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentResult, setSegmentResult] = useState<SegmentResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogContentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useInteractionLayer(
    "modal",
    open
      ? {
          id: "segment-layer-modal",
          ref: dialogContentRef,
          captureClickOutside: true,
          hotkeys: ["Escape"],
          portalSelectors: ["[data-radix-popper-content-wrapper]"],
          onHotkey: (key) => {
            if (key === "Escape" && !isSegmenting && !isCreating) onOpenChange(false);
          },
          onClickOutside: () => {
            if (!isSegmenting && !isCreating) onOpenChange(false);
          },
          onForcePop: () => {
            abortRef.current?.abort();
            setIsSegmenting(false);
            setIsCreating(false);
            setSegmentResult(null);
            setErrorMessage(null);
            setPrompt("");
          },
          yieldedFrom,
        }
      : null
  );

  useEffect(() => {
    if (open) {
      setPrompt("");
      setSegmentResult(null);
      setErrorMessage(null);
      setIsSegmenting(false);
      setIsCreating(false);
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isSegmenting || isCreating)) return;
      if (!next) abortRef.current?.abort();
      onOpenChange(next);
    },
    [isSegmenting, isCreating, onOpenChange]
  );

  const handleSegment = useCallback(async () => {
    if (prompt.trim().length === 0) return;
    const imageUrl = resolveImageUrl(image);
    if (!imageUrl) {
      toast.error("Source image has no media URL");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    log.info("handleSegment", "start", { promptLen: prompt.trim().length });
    setIsSegmenting(true);
    setErrorMessage(null);

    try {
      const res = await callSegmentLayer({ imageUrl, prompt: prompt.trim() });
      if (controller.signal.aborted) return;

      setSegmentResult({
        id: crypto.randomUUID(),
        media_url: res.data!.imageUrl,
        prompt: prompt.trim(),
        coverageRatio: res.meta?.coverageRatio,
      });
      log.info("handleSegment", "success", { coverageRatio: res.meta?.coverageRatio });
    } catch (err) {
      if (controller.signal.aborted) return;
      let msg = "Segmentation failed. Please try again.";
      if (err instanceof SegmentLayerError) {
        if (err.code === "EMPTY_SEGMENTATION") {
          msg = "No object matched your prompt. Try a different one.";
        } else {
          msg = err.message || msg;
        }
      }
      log.error("handleSegment", "failed", { error: String(err) });
      setSegmentResult(null);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      if (!controller.signal.aborted) setIsSegmenting(false);
    }
  }, [prompt, image.media_url]);

  const handleCreateSegment = useCallback(async () => {
    if (!segmentResult) return;
    log.info("handleCreateSegment", "start", { segmentId: segmentResult.id });
    setIsCreating(true);
    try {
      onCreateSegment(segmentResult);
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  }, [segmentResult, onCreateSegment, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isSegmenting && prompt.trim().length > 0) handleSegment();
      }
    },
    [isSegmenting, prompt, handleSegment]
  );

  const imageTitle = image.title || "Untitled";
  const resolvedImageUrl = resolveImageUrl(image);
  const hasMediaUrl = !!resolvedImageUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-3xl"
        onKeyDown={handleKeyDown}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointerSquareDashed className="h-5 w-5" />
            Segment Layer: {imageTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Original */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Original Image</Label>
              <div className="h-[300px] w-full border rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                {resolvedImageUrl ? (
                  <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] leading-[0] rounded-sm overflow-hidden">
                    <img
                      src={resolvedImageUrl}
                      alt={`Original image: ${imageTitle}`}
                      className="max-w-full max-h-[300px] block"
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">No image</span>
                )}
              </div>
            </div>

            {/* Generated */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Generated Segment</Label>
              <div
                className="h-[300px] w-full border rounded-lg bg-muted overflow-hidden flex items-center justify-center"
                aria-label="Segment result preview"
              >
                {isSegmenting ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Segmenting...</span>
                  </div>
                ) : segmentResult ? (
                  <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] leading-[0] rounded-sm overflow-hidden">
                    <img
                      src={segmentResult.media_url}
                      alt={`Segmented: ${segmentResult.prompt}`}
                      className="max-w-full max-h-[300px] block"
                    />
                  </div>
                ) : errorMessage ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-destructive" role="alert" aria-live="polite">
                    <AlertCircle className="h-6 w-6" />
                    <span className="text-xs text-center px-2">{errorMessage}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <MousePointerSquareDashed className="h-6 w-6" />
                    <span className="text-xs">No segment yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <Label className="text-sm font-semibold mb-2 block" htmlFor="segment-prompt">
              Prompt
            </Label>
            <Textarea
              id="segment-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Object to extract (English) — e.g. "person", "red shirt", "dog&apos;s face"'
              rows={2}
              autoFocus
              disabled={isSegmenting || isCreating}
              aria-label="Segmentation prompt"
              aria-describedby="segment-hint"
            />
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="default"
              disabled={prompt.trim().length === 0 || isSegmenting || isCreating || !hasMediaUrl}
              onClick={handleSegment}
              aria-label="Run segmentation"
            >
              {isSegmenting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Segmenting...
                </>
              ) : (
                <>
                  <MousePointerSquareDashed className="h-4 w-4 mr-2" />
                  Segment Layer
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              disabled={segmentResult === null || isCreating || isSegmenting}
              onClick={handleCreateSegment}
              aria-label="Create segment as new image"
              aria-disabled={segmentResult === null || isCreating || isSegmenting}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Segment
                </>
              )}
            </Button>
          </div>
        </div>

        <p id="segment-hint" className="text-xs text-muted-foreground text-center mt-1">
          Press Ctrl/Cmd + Enter to segment
        </p>
      </DialogContent>
    </Dialog>
  );
}
