"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Scissors, Loader2, Check, ImagePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/utils/logger";
import type { SpreadImage } from "@/types/spread-types";

const log = createLogger("Editor", "SplitImageModal");

// === Types ===

export interface SplitLayerResult {
  id: string;
  title: string;
  media_url: string;
}

interface SplitImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: SpreadImage;
  onCreateImages: (layers: SplitLayerResult[]) => void;
}

// === Constants ===

const SEED_MIN = 0;
const SEED_MAX = 999999;
const SEED_DEFAULT = 42;
const LAYERS_MIN = 2;
const LAYERS_MAX = 10;
const LAYERS_DEFAULT = 3;

// === Component ===

export function SplitImageModal({
  open,
  onOpenChange,
  image,
  onCreateImages,
}: SplitImageModalProps) {
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [numberOfLayers, setNumberOfLayers] = useState(LAYERS_DEFAULT);

  const [isSplitting, setIsSplitting] = useState(false);
  const [generatedLayers, setGeneratedLayers] = useState<
    SplitLayerResult[] | null
  >(null);

  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    new Set()
  );

  const positivePromptRef = useRef<HTMLTextAreaElement>(null);
  const generatedSectionRef = useRef<HTMLDivElement>(null);

  const resetState = useCallback(() => {
    setPositivePrompt("");
    setNegativePrompt("");
    setSeed(SEED_DEFAULT);
    setNumberOfLayers(LAYERS_DEFAULT);
    setIsSplitting(false);
    setGeneratedLayers(null);
    setSelectedLayerIds(new Set());
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState();
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  // Focus positive prompt on open
  useEffect(() => {
    if (open) {
      setTimeout(() => positivePromptRef.current?.focus(), 100);
    }
  }, [open]);

  // === Handlers ===

  const handleRandomizeSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * (SEED_MAX + 1));
    setSeed(newSeed);
    log.debug("handleRandomizeSeed", "seed randomized", { seed: newSeed });
  }, []);

  const handleSeedInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val)) return;
      setSeed(Math.max(SEED_MIN, Math.min(SEED_MAX, val)));
    },
    []
  );

  const handleLayersInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val)) return;
      setNumberOfLayers(Math.max(LAYERS_MIN, Math.min(LAYERS_MAX, val)));
    },
    []
  );

  const handleSplit = useCallback(async () => {
    setIsSplitting(true);
    log.info("handleSplit", "splitting image", {
      imageId: image.id,
      promptLength: positivePrompt.length,
      negativePromptLength: negativePrompt.length,
      seed,
      numberOfLayers,
    });

    try {
      // Mock API call — replace with real edge function later
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 1000)
      );

      const imageTitle = image.title || "Untitled";
      const layers: SplitLayerResult[] = Array.from(
        { length: numberOfLayers },
        (_, i) => ({
          id: crypto.randomUUID(),
          title: `${imageTitle} - Part ${i + 1}`,
          media_url: `https://picsum.photos/seed/${Date.now()}-${i}/400/400`,
        })
      );

      setGeneratedLayers(layers);
      setSelectedLayerIds(new Set());
      log.info("handleSplit", "split complete", { layerCount: layers.length });

      // Scroll to results after render
      setTimeout(() => {
        generatedSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      log.error("handleSplit", "split failed", { error: String(err) });
      toast.error("Split failed. Please try again.");
    } finally {
      setIsSplitting(false);
    }
  }, [image.id, image.title, positivePrompt, negativePrompt, seed, numberOfLayers]);

  const handleToggleLayer = useCallback((layerId: string) => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  const handleCreateImages = useCallback(() => {
    if (!generatedLayers || selectedLayerIds.size === 0) return;

    log.info("handleCreateImages", "creating images", {
      selectedCount: selectedLayerIds.size,
    });

    const selectedLayers = generatedLayers.filter((l) =>
      selectedLayerIds.has(l.id)
    );
    onCreateImages(selectedLayers);
    handleOpenChange(false);
  }, [generatedLayers, selectedLayerIds, onCreateImages, handleOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isSplitting) handleSplit();
      }
    },
    [isSplitting, handleSplit]
  );

  // === Render ===

  const imageTitle = image.title || "Untitled";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split Layer: {imageTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Positive Prompt */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">
              Positive Prompt
            </Label>
            <Textarea
              ref={positivePromptRef}
              value={positivePrompt}
              onChange={(e) => setPositivePrompt(e.target.value)}
              placeholder="Describe what you want to extract or emphasize..."
              className="min-h-[80px]"
              disabled={isSplitting}
              aria-label="Positive prompt"
            />
          </div>

          {/* Negative Prompt */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">
              Negative Prompt
            </Label>
            <Textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Describe what you want to avoid or exclude..."
              className="min-h-[80px]"
              disabled={isSplitting}
              aria-label="Negative prompt"
            />
          </div>

          {/* Seed Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Seed</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={handleRandomizeSeed}
                  disabled={isSplitting}
                  aria-label="Randomize seed"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <input
                  type="number"
                  value={seed}
                  onChange={handleSeedInputChange}
                  min={SEED_MIN}
                  max={SEED_MAX}
                  disabled={isSplitting}
                  aria-label="Seed value"
                  className="h-7 w-20 rounded-md border border-input bg-transparent px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <Slider
              value={[seed]}
              onValueChange={([v]) => setSeed(v)}
              min={SEED_MIN}
              max={SEED_MAX}
              step={1}
              disabled={isSplitting}
              aria-label="Seed slider"
            />
          </div>

          {/* Number of Layers Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Number of Layers</Label>
              <input
                type="number"
                value={numberOfLayers}
                onChange={handleLayersInputChange}
                min={LAYERS_MIN}
                max={LAYERS_MAX}
                disabled={isSplitting}
                aria-label="Number of layers"
                className="h-7 w-16 rounded-md border border-input bg-transparent px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Slider
              value={[numberOfLayers]}
              onValueChange={([v]) => setNumberOfLayers(v)}
              min={LAYERS_MIN}
              max={LAYERS_MAX}
              step={1}
              disabled={isSplitting}
              aria-label="Number of layers slider"
            />
          </div>

          {/* Split Button */}
          <Button
            onClick={handleSplit}
            disabled={isSplitting}
            className="w-full"
            size="lg"
          >
            {isSplitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Splitting...
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4 mr-2" />
                Split Layer
              </>
            )}
          </Button>

          {/* Generated Layers Section */}
          {generatedLayers && (
            <div ref={generatedSectionRef}>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">
                  Generated Layers
                </Label>
                <span className="text-sm text-muted-foreground">
                  {selectedLayerIds.size} selected
                </span>
              </div>

              <div
                className="grid grid-cols-3 gap-3"
                role="group"
                aria-label="Generated layers"
              >
                {generatedLayers.map((layer) => {
                  const isSelected = selectedLayerIds.has(layer.id);
                  return (
                    <button
                      key={layer.id}
                      onClick={() => handleToggleLayer(layer.id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                        isSelected
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={layer.title}
                    >
                      <img
                        src={layer.media_url}
                        alt={layer.title}
                        className="w-full aspect-square object-cover"
                      />
                      {/* Checkbox overlay */}
                      <div className="absolute top-2 right-2">
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "bg-white/80 border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                      </div>
                      {/* Title */}
                      <div className="px-2 py-1.5 text-xs text-center truncate bg-background">
                        {layer.title}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Create New Images Button */}
              <Button
                onClick={handleCreateImages}
                disabled={selectedLayerIds.size === 0}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700"
                size="lg"
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                Create New Images
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Ctrl/Cmd + Enter to split
        </p>
      </DialogContent>
    </Dialog>
  );
}
