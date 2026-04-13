"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useInteractionLayer } from "@/features/editor/contexts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "EditImageModal");
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Eraser,
  Paperclip,
  Download,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { ImageZoomPreview } from "@/components/ui/image-zoom-preview";
import { callImageRemoveBg } from "@/apis/retouch-api";
import {
  useRetouchImageById,
  useSnapshotActions,
  useImageTasksForChild,
} from "@/stores/snapshot-store";
import { useReferenceImagePicker } from "@/features/editor/hooks/use-reference-image-picker";

interface EditImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spreadId: string;
  imageId: string;
}

export function EditImageModal({
  open,
  onOpenChange,
  spreadId,
  imageId,
}: EditImageModalProps) {
  const image = useRetouchImageById(spreadId, imageId);
  const { startEditTask, updateRetouchImage } = useSnapshotActions();
  const { isEditing } = useImageTasksForChild(spreadId, imageId);

  const dialogContentRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState("");
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  const {
    images: referenceImages,
    inputRef: fileInputRef,
    openPicker,
    handleFilesSelected,
    removeImage,
    clearImages,
  } = useReferenceImagePicker();

  const resetState = useCallback(() => {
    setPrompt("");
    clearImages();
    setIsRemovingBg(false);
  }, [clearImages]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetState();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  // Seed illustrations from media_url if image has none
  const illustrationsCount = image?.illustrations?.length ?? 0;
  const imageMediaUrl = image?.media_url;
  useEffect(() => {
    if (!open || !image) return;
    if (illustrationsCount > 0) return;
    if (!imageMediaUrl) return;
    log.debug("EditImageModal", "seeding illustrations from media_url", { imageId });
    updateRetouchImage(spreadId, imageId, {
      illustrations: [{
        media_url: imageMediaUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, illustrationsCount, imageMediaUrl, spreadId, imageId, updateRetouchImage]);

  const handleDownload = useCallback(async () => {
    if (!image) return;
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!selectedIllustration) return;

    try {
      const response = await fetch(selectedIllustration.media_url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${image.title || "image"}_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
    } catch {
      alert("Failed to download image");
    }
  }, [image]);

  const handleGallerySelect = useCallback(
    (index: number) => {
      if (!image?.illustrations) return;

      const updatedIllustrations = image.illustrations.map((ill, i) => ({
        ...ill,
        is_selected: i === index,
      }));

      updateRetouchImage(spreadId, imageId, { illustrations: updatedIllustrations });
    },
    [image?.illustrations, spreadId, imageId, updateRetouchImage]
  );

  const handleGenerate = useCallback(() => {
    if (!image) return;
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!selectedIllustration) return;

    if (!prompt.trim()) {
      alert("Please enter an editing prompt");
      return;
    }

    log.info("handleGenerate", "dispatching edit task", {
      prompt,
      currentImageUrl: selectedIllustration.media_url,
      refCount: referenceImages.length,
    });

    startEditTask({
      entityType: "retouch_image",
      entityKey: spreadId,
      entityName: image.title || "Image",
      childKey: imageId,
      childName: image.title || "Illustration",
      prompt: prompt.trim(),
      imageUrl: selectedIllustration.media_url,
      referenceImages: referenceImages.length > 0
        ? referenceImages.map(({ base64Data, mimeType }) => ({ base64Data, mimeType }))
        : undefined,
      aspectRatio: image.aspect_ratio,
    });
  }, [prompt, referenceImages, image, spreadId, imageId, startEditTask]);

  const isBusy = isEditing || isRemovingBg;

  const handleRemoveBackground = useCallback(async () => {
    if (!image) return;
    const selectedIll = image.illustrations?.find((ill) => ill.is_selected);
    if (!selectedIll) return;

    setIsRemovingBg(true);

    log.info("handleRemoveBackground", "removing background", {
      currentImageUrl: selectedIll.media_url,
    });

    try {
      const result = await callImageRemoveBg({
        imageUrl: selectedIll.media_url,
      });

      if (!result.success || !result.data) {
        log.error("handleRemoveBackground", "API error", { error: result.error });
        alert(result.error || "Failed to remove background");
        return;
      }

      log.info("handleRemoveBackground", "success", {
        processingTime: result.meta?.processingTime,
        storagePath: result.data.storagePath,
      });

      const updatedIllustrations = [
        {
          media_url: result.data.imageUrl,
          created_time: new Date().toISOString(),
          is_selected: true,
        },
        ...(image.illustrations || []).map((ill) => ({
          ...ill,
          is_selected: false,
        })),
      ];

      updateRetouchImage(spreadId, imageId, { illustrations: updatedIllustrations });
    } catch (err) {
      log.error("handleRemoveBackground", "unexpected error", { error: err });
      alert("An unexpected error occurred");
    } finally {
      setIsRemovingBg(false);
    }
  }, [image, spreadId, imageId, updateRetouchImage]);

  // Register modal slot — prevents Delete/Escape bubbling to item slot while open.
  // captureClickOutside: true so click outside only closes modal, not deselects item.
  useInteractionLayer(
    "modal",
    open
      ? {
          id: "edit-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape"],
          onHotkey: (key) => {
            if (key === "Escape" && !isBusy) handleOpenChange(false);
          },
          onClickOutside: () => handleOpenChange(false),
          captureClickOutside: true,
          portalSelectors: [
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            '[role="listbox"]',
          ],
        }
      : null
  );

  // Guard: image deleted while modal open
  if (!image) return null;

  const selectedIllustration = image.illustrations?.find(
    (ill) => ill.is_selected
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {image.title || "Untitled"} - Edit image
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Preview + Gallery */}
          <div className="flex gap-4">
            {/* Main Preview */}
            <div className="flex-[6] flex items-center justify-center">
              {selectedIllustration ? (
                <div className="relative rounded-md bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px]">
                  <img
                    key={selectedIllustration.media_url}
                    src={selectedIllustration.media_url}
                    alt="Selected illustration"
                    className="h-[360px] w-auto rounded-md object-contain"
                  />
                  <ImageZoomPreview
                    src={selectedIllustration.media_url}
                    alt="Selected illustration"
                    className="absolute inset-0 h-full w-full rounded-md"
                    disabled={isBusy}
                  />
                  {isBusy && (
                    <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center z-20">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">
                          {isRemovingBg ? "Removing background..." : "Editing image..."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleDownload}
                      disabled={isBusy}
                      aria-label="Download image"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No images generated</p>
              )}
            </div>

            {/* Gallery - sorted newest to oldest */}
            <div className="flex-[4]">
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">LATEST</Label>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[328px] overflow-y-auto p-0.5">
                {image.illustrations && image.illustrations.length > 0 ? (
                  [...image.illustrations]
                    .map((ill, origIdx) => ({ ...ill, origIdx }))
                    .sort(
                      (a, b) =>
                        new Date(b.created_time).getTime() -
                        new Date(a.created_time).getTime()
                    )
                    .map((illustration) => (
                      <button
                        key={illustration.origIdx}
                        className={`relative aspect-square rounded-md transition-all bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:12px_12px] ${
                          illustration.is_selected
                            ? "ring-2 ring-primary"
                            : "ring-1 ring-border hover:scale-105"
                        }`}
                        onClick={() =>
                          handleGallerySelect(illustration.origIdx)
                        }
                        disabled={isBusy}
                      >
                        <img
                          src={illustration.media_url}
                          alt={`Illustration ${illustration.origIdx + 1}`}
                          className="w-full h-full object-contain rounded-md"
                        />
                        {illustration.is_selected && (
                          <div className="absolute top-1.5 left-1.5">
                            <div className="rounded-full bg-primary p-1">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))
                ) : (
                  <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                    No images generated yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prompt Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">PROMPT</Label>
              {referenceImages.length > 0 && referenceImages.map((img, idx) => (
                <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs">
                  <span className="truncate max-w-[150px]">
                    {img.label}
                  </span>
                  <button
                    onClick={() => removeImage(idx)}
                    className="hover:bg-blue-100 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-6 w-6 p-0"
                onClick={openPicker}
                disabled={isBusy}
                aria-label="Attach reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFilesSelected}
                multiple
                className="hidden"
              />
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the object you want to generate..."
              className="min-h-[80px]"
              disabled={isBusy}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-center gap-2">
          <Button
            onClick={handleGenerate}
            disabled={isBusy}
            className="w-40"
          >
            {isEditing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
          <Button
            onClick={handleRemoveBackground}
            disabled={isBusy || !selectedIllustration}
            variant="outline"
            className="w-52"
          >
            {isRemovingBg ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Eraser className="h-4 w-4 mr-2" />
                Remove background
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
