"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useInteractionLayer } from "@/features/editor/contexts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Paperclip,
  Pencil,
  Download,
  Check,
  X,
  Send,
} from "lucide-react";
import { ImageZoomPreview } from "@/components/ui/image-zoom-preview";
import { downloadImage } from "@/utils/download-image";
import { useReferenceImagePicker } from "@/features/editor/hooks/use-reference-image-picker";
import { useArtStyleDescription } from "@/stores/art-style-store";
import {
  useSnapshotActions,
  useStages,
  useImageTasksForChild,
} from "@/stores/snapshot-store";
import { createLogger } from "@/utils/logger";
import type { SpreadImage } from "@/types/spread-types";

const log = createLogger("Editor", "GenerateImageModal");

interface GenerateImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spreadId: string;
  image: SpreadImage;
  onUpdateImage: (updates: Partial<SpreadImage>) => void;
}

interface FlatStageVariant {
  ref: string | null;
  label: string;
  thumbnail_url: string | null;
}

const EDGE_TREATMENT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "cutout", label: "Cutout" },
  { value: "faded", label: "Faded" },
  { value: "geometric", label: "Geometric" },
  { value: "stroke", label: "Stroke" },
];

export function GenerateImageModal({
  open,
  onOpenChange,
  spreadId,
  image,
  onUpdateImage,
}: GenerateImageModalProps) {
  const [prompt, setPrompt] = useState(image.visual_description ?? "");
  const [selectedStageVariant, setSelectedStageVariant] = useState<
    string | null
  >(image.stage_variant || null);
  const [edgeTreatment, setEdgeTreatment] = useState("none");
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false);
  const [editPromptText, setEditPromptText] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // Register modal slot — 2 purposes:
  // 1. Prevent Delete/Backspace routing to slot 'item' while modal is open.
  // 2. Capture click-outside at modal level (captureClickOutside: true) so Provider
  //    stops walking and does NOT fire item's onClickOutside (deselect bug).
  // onPointerDownOutside on DialogContent prevents Radix from closing modal before
  // Provider's mousedown handler runs, ensuring modal slot is still in stack.
  useInteractionLayer(
    "modal",
    open
      ? {
          id: "generate-image-modal",
          ref: dialogContentRef,
          hotkeys: ["Escape"],
          onHotkey: (key) => {
            // isProcessing is declared below but freshened via the hook's proxy on every render
            if (key === "Escape" && !isProcessing) handleOpenChange(false);
          },
          onClickOutside: () => handleOpenChange(false),
          captureClickOutside: true,
          // Include Radix portals so clicks inside them are not outside-clicks on modal.
          portalSelectors: [
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            '[role="listbox"]',
            "[data-image-zoom-dialog]",
          ],
          // Snapshot open dropdowns/popovers at pointerdown time so that clicking
          // outside to dismiss them doesn't also close the modal.
          dropdownSelectors: [
            "[data-radix-select-content]",
            "[data-radix-popover-content]",
            "[data-radix-popper-content-wrapper]",
          ],
        }
      : null
  );

  // Store hooks
  const { startGenerateTask, startEditTask } = useSnapshotActions();
  const stages = useStages();
  const artStyleDescription = useArtStyleDescription();
  const { isProcessing } = useImageTasksForChild(spreadId, image.id);

  // Reference image pickers for generate and edit flows
  const generateRefs = useReferenceImagePicker();
  const editRefs = useReferenceImagePicker();

  // Flatten stages → variants for the stage variant selector
  const stageVariantOptions = useMemo<FlatStageVariant[]>(() => {
    const options: FlatStageVariant[] = [
      { ref: null, label: "None", thumbnail_url: null },
    ];
    for (const stage of stages) {
      for (const variant of stage.variants) {
        const selectedIll = variant.illustrations.find(
          (ill) => ill.is_selected
        );
        options.push({
          ref: `@${stage.key}/${variant.key}`,
          label: `${stage.name} - ${variant.name}`,
          thumbnail_url:
            selectedIll?.media_url ??
            variant.illustrations[0]?.media_url ??
            null,
        });
      }
    }
    return options;
  }, [stages]);

  const resetState = useCallback(() => {
    setPrompt(image.visual_description ?? "");
    setSelectedStageVariant(image.stage_variant || null);
    setEdgeTreatment("none");
    setIsEditPopoverOpen(false);
    setEditPromptText("");
    generateRefs.clearImages();
    editRefs.clearImages();
  }, [image.stage_variant, image.visual_description, generateRefs, editRefs]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetState();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  const handleDownload = useCallback(async () => {
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!selectedIllustration) return;

    try {
      await downloadImage(selectedIllustration.media_url, image.title);
    } catch (err) {
      log.error("handleDownload", "failed", { error: String(err) });
      alert("Failed to download image");
    }
  }, [image.illustrations, image.title]);

  const handleGallerySelect = useCallback(
    (mediaUrl: string) => {
      if (!image.illustrations) return;
      const updatedIllustrations = image.illustrations.map((ill) => ({
        ...ill,
        is_selected: ill.media_url === mediaUrl,
      }));
      onUpdateImage({ illustrations: updatedIllustrations });
    },
    [image.illustrations, onUpdateImage]
  );

  const handleStageVariantSelect = useCallback(
    (ref: string | null) => {
      setSelectedStageVariant(ref);
      onUpdateImage({ stage_variant: ref || undefined });
    },
    [onUpdateImage]
  );

  // Resolve stage variant image URL from selected stage variant ref
  const resolveStageVariantImageUrl = useCallback((): string | undefined => {
    if (!selectedStageVariant) return undefined;
    // Parse ref format: @stage_key/variant_key
    const match = selectedStageVariant.match(/^@([^/]+)\/(.+)$/);
    if (!match) return undefined;
    const [, stageKey, variantKey] = match;
    const stage = stages.find((s) => s.key === stageKey);
    const variant = stage?.variants.find((s) => s.key === variantKey);
    return (
      variant?.illustrations.find((ill) => ill.is_selected)?.media_url ??
      variant?.illustrations[0]?.media_url
    );
  }, [selectedStageVariant, stages]);

  const handleGenerate = useCallback(() => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isProcessing) return;

    onUpdateImage({ visual_description: trimmedPrompt });

    log.info("handleGenerate", "start", {
      spreadId,
      imageId: image.id,
      promptLength: trimmedPrompt.length,
      refCount: generateRefs.images.length,
      stageVariant: selectedStageVariant,
    });

    const referenceImages =
      generateRefs.images.length > 0
        ? generateRefs.images.map(({ base64Data, mimeType }) => ({
            base64Data,
            mimeType,
          }))
        : undefined;

    log.debug("handleGenerate", "params", {
      aspectRatio: image.aspect_ratio,
      imageId: image.id,
    });

    startGenerateTask({
      entityType: "illustration_image",
      entityKey: spreadId,
      entityName: image.title || "Spread",
      childKey: image.id,
      childName: image.title || "Image",
      visualDescription: trimmedPrompt,
      artStyleDescription: artStyleDescription ?? "",
      stageVariantImageUrl: resolveStageVariantImageUrl(),
      referenceImages,
      aspectRatio: image.aspect_ratio,
    });

    generateRefs.clearImages();
  }, [
    prompt,
    isProcessing,
    spreadId,
    image.id,
    image.title,
    image.aspect_ratio,
    generateRefs,
    selectedStageVariant,
    artStyleDescription,
    resolveStageVariantImageUrl,
    startGenerateTask,
    onUpdateImage,
  ]);

  const handleEditImage = useCallback(() => {
    const trimmed = editPromptText.trim();
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!trimmed || !selectedIllustration || isProcessing) return;

    log.info("handleEditImage", "start", {
      spreadId,
      imageId: image.id,
      prompt: trimmed,
      refCount: editRefs.images.length,
    });

    setIsEditPopoverOpen(false);

    const referenceImages =
      editRefs.images.length > 0
        ? editRefs.images.map(({ base64Data, mimeType }) => ({
            base64Data,
            mimeType,
          }))
        : undefined;

    startEditTask({
      entityType: "illustration_image",
      entityKey: spreadId,
      entityName: image.title || "Spread",
      childKey: image.id,
      childName: image.title || "Image",
      prompt: trimmed,
      imageUrl: selectedIllustration.media_url,
      referenceImages,
      aspectRatio: image.aspect_ratio,
    });

    setEditPromptText("");
    editRefs.clearImages();
  }, [
    editPromptText,
    image.illustrations,
    image.id,
    image.title,
    image.aspect_ratio,
    isProcessing,
    spreadId,
    editRefs,
    startEditTask,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isProcessing) {
          handleGenerate();
        }
      }
    },
    [isProcessing, handleGenerate]
  );

  const selectedIllustration = image.illustrations?.find(
    (ill) => ill.is_selected
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {image.title || "Untitled"} - Image Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Preview + Gallery */}
          <div className="flex gap-4">
            {/* Main Preview (60%) */}
            <div className="flex-[6] flex items-center justify-center">
              {selectedIllustration ? (
                <div className="relative">
                  <img
                    key={selectedIllustration.media_url}
                    src={selectedIllustration.media_url}
                    alt="Selected illustration"
                    className="h-[360px] w-auto rounded-md object-contain"
                  />
                  {/* Zoom overlay */}
                  <ImageZoomPreview
                    src={selectedIllustration.media_url}
                    alt={image.title || "Preview"}
                    className="absolute inset-0 h-full w-full rounded-md"
                    disabled={isProcessing}
                  />
                  {/* Processing overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center z-20">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Generating...
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Floating action buttons */}
                  <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                    <Popover
                      open={isEditPopoverOpen}
                      onOpenChange={setIsEditPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isProcessing}
                          aria-label="Edit image"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="end"
                        className="w-80 p-3"
                      >
                        {editRefs.images.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {editRefs.images.map((img, idx) => (
                              <div
                                key={`edit-${img.label}-${idx}`}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                              >
                                <span className="truncate max-w-[120px]">
                                  {img.label}
                                </span>
                                <button
                                  onClick={() => editRefs.removeImage(idx)}
                                  className="hover:bg-blue-100 rounded"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Textarea
                            value={editPromptText}
                            onChange={(e) => setEditPromptText(e.target.value)}
                            placeholder="Describe changes..."
                            className="min-h-[60px] flex-1 resize-none text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleEditImage();
                              }
                            }}
                          />
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={editRefs.openPicker}
                              aria-label="Attach reference image"
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              className="h-8 w-8"
                              disabled={!editPromptText.trim()}
                              onClick={handleEditImage}
                              aria-label="Submit edit"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {/* Hidden file input for edit reference images */}
                        <input
                          ref={editRefs.inputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          onChange={editRefs.handleFilesSelected}
                          className="hidden"
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleDownload}
                      disabled={isProcessing}
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

            {/* Gallery (40%) */}
            <div className="flex-[4]">
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">LATEST</Label>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-[328px] overflow-y-auto p-0.5">
                {image.illustrations && image.illustrations.length > 0 ? (
                  [...image.illustrations]
                    .sort(
                      (a, b) =>
                        new Date(b.created_time).getTime() -
                        new Date(a.created_time).getTime()
                    )
                    .map((illustration, index) => (
                      <button
                        key={index}
                        className={`relative aspect-square rounded-md transition-all ${
                          illustration.is_selected
                            ? "ring-2 ring-primary"
                            : "ring-1 ring-border hover:scale-105"
                        }`}
                        onClick={() =>
                          handleGallerySelect(illustration.media_url)
                        }
                        disabled={isProcessing}
                      >
                        <img
                          src={illustration.media_url}
                          alt={`Illustration ${index + 1}`}
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
                  <div className="col-span-3 text-center text-sm text-muted-foreground py-8">
                    No images generated yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stage Variant Section — from store */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              STAGE VARIANT
            </Label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {stageVariantOptions.map((variant) => (
                <button
                  key={variant.ref || "none"}
                  className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 hover:border-primary transition-colors ${
                    selectedStageVariant === variant.ref
                      ? "border-primary"
                      : "border-border"
                  }`}
                  onClick={() => handleStageVariantSelect(variant.ref)}
                  disabled={isProcessing}
                >
                  {variant.thumbnail_url ? (
                    <img
                      src={variant.thumbnail_url}
                      alt={variant.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-purple-600" />
                  )}
                  {selectedStageVariant === variant.ref && (
                    <div className="absolute top-1 right-1 rounded-full bg-purple-600 p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs py-1 px-1 truncate">
                    {variant.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Section — with useReferenceImagePicker */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">
                VISUAL DESCRIPTION
              </Label>
              {generateRefs.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {generateRefs.images.map((img, idx) => (
                    <div
                      key={`gen-${img.label}-${idx}`}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                    >
                      <span className="truncate max-w-[150px]">
                        {img.label}
                      </span>
                      <button
                        onClick={() => generateRefs.removeImage(idx)}
                        className="hover:bg-blue-100 rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-6 w-6 p-0"
                onClick={generateRefs.openPicker}
                disabled={isProcessing}
                aria-label="Upload reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={generateRefs.inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={generateRefs.handleFilesSelected}
                className="hidden"
              />
            </div>
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the scene..."
              className="min-h-[80px]"
              disabled={isProcessing}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Press Ctrl/Cmd + Enter to generate
            </p>
          </div>

          {/* Edge Treatment Section */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              EDGE TREATMENT
            </Label>
            <Select
              value={edgeTreatment}
              onValueChange={setEdgeTreatment}
              disabled={isProcessing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDGE_TREATMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleGenerate}
            disabled={isProcessing || !prompt.trim()}
            className="w-40"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Processing
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
