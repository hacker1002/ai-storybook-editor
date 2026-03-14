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

const log = createLogger('Editor', 'GenerateImageModal');
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
import { Sparkles, Paperclip, Edit2, Download, Check, X, Loader2 } from "lucide-react";
import type { SpreadImage } from "@/types/spread-types";

interface GenerateImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onUpdateImage: (updates: Partial<SpreadImage>) => void;
}

interface StageSettingOption {
  ref: string | null;
  label: string;
  thumbnail_url: string | null;
}

interface Illustration {
  media_url: string;
  created_time: string;
  is_selected: boolean;
}

const MOCK_STAGE_SETTINGS: StageSettingOption[] = [
  {
    ref: null,
    label: "None",
    thumbnail_url: null,
  },
  {
    ref: "@forest_1/day",
    label: "Forest Day",
    thumbnail_url: "https://picsum.photos/seed/forest-day/100/100",
  },
  {
    ref: "@forest_1/night",
    label: "Forest Night",
    thumbnail_url: "https://picsum.photos/seed/forest-night/100/100",
  },
  {
    ref: "@castle_1/default",
    label: "Castle",
    thumbnail_url: "https://picsum.photos/seed/castle/100/100",
  },
];

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
  image,
  onUpdateImage,
}: GenerateImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [selectedStageSetting, setSelectedStageSetting] = useState<
    string | null
  >(image.setting || null);
  const [edgeTreatment, setEdgeTreatment] = useState("none");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingReference, setIsLoadingReference] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetState = useCallback(() => {
    setPrompt("");
    setReferenceImage(null);
    setSelectedStageSetting(image.setting || null);
    setEdgeTreatment("none");
    setIsGenerating(false);
    setIsLoadingReference(false);
  }, [image.setting]);

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
        setReferenceImage({
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

  const handleUseAsReference = useCallback(() => {
    const selectedIllustration = image.illustrations?.find(
      (ill) => ill.is_selected
    );
    if (!selectedIllustration) return;

    setIsLoadingReference(true);
    fetch(selectedIllustration.media_url)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          setReferenceImage({
            base64,
            filename: "current_image.jpg",
          });
          setIsLoadingReference(false);
          textareaRef.current?.focus();
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        setIsLoadingReference(false);
        alert("Failed to load reference image");
      });
  }, [image.illustrations]);

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

  const handleStageSettingSelect = useCallback(
    (ref: string | null) => {
      setSelectedStageSetting(ref);
      onUpdateImage({ setting: ref || undefined });
    },
    [onUpdateImage]
  );

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);

    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000)
    );

    let width = 800;
    let height = 600;

    const existingUrl = image.illustrations?.[0]?.media_url;
    if (existingUrl) {
      const match = existingUrl.match(/picsum\.photos\/seed\/[^/]+\/(\d+)\/(\d+)/);
      if (match) {
        width = parseInt(match[1], 10);
        height = parseInt(match[2], 10);
      }
    }

    log.info('handleGenerate', 'generating image', {
      prompt,
      hasReferenceImage: !!referenceImage,
      stageSetting: selectedStageSetting,
      edgeTreatment,
      width,
      height,
    });

    const newIllustration: Illustration = {
      media_url: `https://picsum.photos/seed/${Date.now()}/${width}/${height}`,
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

    setIsGenerating(false);
  }, [prompt, referenceImage, selectedStageSetting, edgeTreatment, image.illustrations, onUpdateImage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isGenerating) {
          handleGenerate();
        }
      }
    },
    [isGenerating, handleGenerate]
  );

  const selectedIllustration = image.illustrations?.find(
    (ill) => ill.is_selected
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {image.title || "Untitled"} - Image Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Preview Section */}
          <div className="flex gap-4">
            {/* Main Preview (60%) */}
            <div className="flex-[6] flex items-center justify-center">
              {selectedIllustration ? (
                <div className="relative">
                  <img
                    key={selectedIllustration.media_url}
                    src={selectedIllustration.media_url}
                    alt="Selected illustration"
                    className="h-[360px] w-auto rounded-md"
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">
                          Generating image...
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleUseAsReference}
                      disabled={isGenerating || isLoadingReference}
                      aria-label="Use as reference"
                    >
                      {isLoadingReference ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Edit2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleDownload}
                      disabled={isGenerating}
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
                  image.illustrations.map((illustration, index) => (
                    <button
                      key={index}
                      className={`relative aspect-square rounded-md transition-all ${
                        illustration.is_selected
                          ? "ring-2 ring-primary"
                          : "ring-1 ring-border hover:scale-105"
                      }`}
                      onClick={() => handleGallerySelect(index)}
                      disabled={isGenerating}
                    >
                      <img
                        src={illustration.media_url}
                        alt={`Illustration ${index + 1}`}
                        className="w-full h-full object-cover rounded-md"
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

          {/* Stage Setting Section */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              STAGE SETTING
            </Label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {MOCK_STAGE_SETTINGS.map((setting) => (
                <button
                  key={setting.ref || "none"}
                  className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 hover:border-primary transition-colors ${
                    selectedStageSetting === setting.ref
                      ? "border-primary"
                      : "border-border"
                  }`}
                  onClick={() => handleStageSettingSelect(setting.ref)}
                  disabled={isGenerating}
                >
                  {setting.thumbnail_url ? (
                    <img
                      src={setting.thumbnail_url}
                      alt={setting.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-purple-600"></div>
                  )}
                  {selectedStageSetting === setting.ref && (
                    <div className="absolute top-1 right-1 rounded-full bg-purple-600 p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs py-1 px-1 truncate">
                    {setting.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">PROMPT</Label>
              {referenceImage && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs">
                  <span className="truncate max-w-[150px]">
                    {referenceImage.filename}
                  </span>
                  <button
                    onClick={() => setReferenceImage(null)}
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
                disabled={isGenerating}
                aria-label="Upload reference image"
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
              onKeyDown={handleKeyDown}
              placeholder="Describe the scene..."
              className="min-h-[80px]"
              disabled={isGenerating}
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
              disabled={isGenerating}
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
            disabled={isGenerating}
            className="w-40"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating
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
