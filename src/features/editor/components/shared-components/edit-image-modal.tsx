"use client";

import { useState, useRef, useCallback } from "react";
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
import type { SpreadImage } from "@/types/spread-types";
import { callEditObjectImage, callImageRemoveBg } from "@/apis/retouch-api";

interface EditImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onUpdateImage: (updates: Partial<SpreadImage>) => void;
}

interface Illustration {
  media_url: string;
  created_time: string;
  is_selected: boolean;
}

export function EditImageModal({
  open,
  onOpenChange,
  image,
  onUpdateImage,
}: EditImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [attachedImage, setAttachedImage] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetState = useCallback(() => {
    setPrompt("");
    setAttachedImage(null);
    setIsGenerating(false);
    setIsRemovingBg(false);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetState();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("File size must be less than 10MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedImage({
          base64,
          filename: file.name,
        });
      };
      reader.onerror = () => {
        alert("Failed to read file.");
      };
      reader.readAsDataURL(file);

      e.target.value = "";
    },
    []
  );

  const handleDownload = useCallback(async () => {
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
  }, [image.illustrations, image.title]);

  const handleGallerySelect = useCallback(
    (index: number) => {
      if (!image.illustrations) return;

      const updatedIllustrations = image.illustrations.map((ill, i) => ({
        ...ill,
        is_selected: i === index,
      }));

      onUpdateImage({ illustrations: updatedIllustrations });
    },
    [image.illustrations, onUpdateImage]
  );

  const handleGenerate = useCallback(async () => {
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!selectedIllustration) return;

    if (!prompt.trim()) {
      alert("Please enter an editing prompt");
      return;
    }

    setIsGenerating(true);

    log.info("handleGenerate", "editing image", {
      prompt,
      currentImageUrl: selectedIllustration.media_url,
      hasAttachedImage: !!attachedImage,
    });

    try {
      // Build referenceImage from attached file (strip data URI prefix)
      let referenceImage: { base64Data: string; mimeType: string } | undefined;
      if (attachedImage) {
        const [header, base64Data] = attachedImage.base64.split(",");
        const mimeMatch = header.match(/data:(image\/[^;]+);/);
        const mimeType = mimeMatch?.[1] || "image/png";
        referenceImage = { base64Data, mimeType };
      }

      const result = await callEditObjectImage({
        prompt: prompt.trim(),
        imageUrl: selectedIllustration.media_url,
        referenceImage,
        aspectRatio: image.aspect_ratio,
      });

      if (!result.success || !result.data) {
        log.error("handleGenerate", "API error", { error: result.error });
        alert(result.error || "Failed to edit image");
        return;
      }

      log.info("handleGenerate", "success", {
        processingTime: result.meta?.processingTime,
        storagePath: result.data.storagePath,
      });

      const newIllustration: Illustration = {
        media_url: result.data.imageUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      };

      const updatedIllustrations = [
        newIllustration,
        ...(image.illustrations || []).map((ill) => ({
          ...ill,
          is_selected: false,
        })),
      ];

      onUpdateImage({ illustrations: updatedIllustrations });
    } catch (err) {
      log.error("handleGenerate", "unexpected error", { error: err });
      alert("An unexpected error occurred");
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, attachedImage, image.illustrations, onUpdateImage]);

  const isBusy = isGenerating || isRemovingBg;

  const handleRemoveBackground = useCallback(async () => {
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

      const newIllustration: Illustration = {
        media_url: result.data.imageUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      };

      const updatedIllustrations = [
        newIllustration,
        ...(image.illustrations || []).map((ill) => ({
          ...ill,
          is_selected: false,
        })),
      ];

      onUpdateImage({ illustrations: updatedIllustrations });
    } catch (err) {
      log.error("handleRemoveBackground", "unexpected error", { error: err });
      alert("An unexpected error occurred");
    } finally {
      setIsRemovingBg(false);
    }
  }, [image.illustrations, onUpdateImage]);

  const selectedIllustration = image.illustrations?.find(
    (ill) => ill.is_selected
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
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
                <div className="relative">
                  <img
                    key={selectedIllustration.media_url}
                    src={selectedIllustration.media_url}
                    alt="Selected illustration"
                    className="h-[360px] w-auto rounded-md object-contain"
                  />
                  {isBusy && (
                    <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">
                          {isRemovingBg ? "Removing background..." : "Editing image..."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 flex gap-2">
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
                        className={`relative aspect-square rounded-md transition-all ${
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
              {attachedImage && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs">
                  <span className="truncate max-w-[150px]">
                    {attachedImage.filename}
                  </span>
                  <button
                    onClick={() => setAttachedImage(null)}
                    className="hover:bg-blue-100 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-6 w-6 p-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                aria-label="Attach reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <Textarea
              ref={textareaRef}
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
            {isGenerating ? (
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
