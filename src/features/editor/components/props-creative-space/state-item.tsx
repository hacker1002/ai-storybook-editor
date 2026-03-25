// state-item.tsx - Accordion item for a single prop state with image gallery + prompt section

import { useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Upload,
  Download,
  Paperclip,
  X,
  Check,
  Sparkles,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { ImageZoomPreview } from "@/components/ui/image-zoom-preview";
import { Label } from "@/components/ui/label";
import { useSnapshotActions } from "@/stores/snapshot-store";
import type { PropState } from "@/types/prop-types";
import { uploadImageToStorage } from "@/apis/storage-api";
import { createLogger } from "@/utils/logger";
import { cn } from "@/utils/utils";
import { toast } from "sonner";

const log = createLogger("Editor", "StateItem");

interface StateItemProps {
  propKey: string;
  stateData: PropState;
  isExpanded: boolean;
  onToggle: () => void;
}

export function StateItem({
  propKey,
  stateData,
  isExpanded,
  onToggle,
}: StateItemProps) {
  const { deletePropState, updatePropState } = useSnapshotActions();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Determine initial selected index: prefer is_selected=true, else 0
  const initSelectedIdx = () => {
    const idx = stateData.illustrations.findIndex((ill) => ill.is_selected);
    return idx >= 0 ? idx : 0;
  };

  const [selectedIllustrationIndex, setSelectedIllustrationIndex] =
    useState<number>(initSelectedIdx);
  const [promptText, setPromptText] = useState<string>(
    stateData.visual_description ?? ""
  );
  const [attachedImage, setAttachedImage] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // type 0 = default state, cannot be deleted or have images uploaded
  const isDefault = stateData.type === 0;

  const sortedIllustrations = [...stateData.illustrations].sort(
    (a, b) =>
      new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
  );

  const selectedIllustration =
    stateData.illustrations[selectedIllustrationIndex];

  const handleAttachCurrentImage = () => {
    if (!selectedIllustration) return;
    log.debug("handleAttachCurrentImage", "attach current", {
      url: selectedIllustration.media_url,
    });
    setAttachedImage({
      label: "Current image",
      url: selectedIllustration.media_url,
    });
  };

  const handleDownload = () => {
    if (!selectedIllustration) return;
    log.debug("handleDownload", "open in new tab", {
      url: selectedIllustration.media_url,
    });
    window.open(selectedIllustration.media_url, "_blank");
  };

  const handleAttachFile = () => {
    log.warn("handleAttachFile", "File upload not implemented yet");
  };

  const handleGenerate = () => {
    log.warn("handleGenerate", "Generate API not implemented yet");
    setIsGenerating(true);
    // Placeholder — in production this calls an API
    setTimeout(() => setIsGenerating(false), 1500);
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    log.info("handleUpload", "start upload", {
      propKey,
      stateKey: stateData.key,
      fileName: file.name,
      size: file.size,
    });
    setIsUploading(true);
    try {
      const result = await uploadImageToStorage(
        file,
        `props/${propKey}/${stateData.key}`
      );
      log.info("handleUpload", "upload complete", {
        publicUrl: result.publicUrl,
      });

      // Deselect all existing illustrations, prepend new one as selected
      const updatedIllustrations = stateData.illustrations.map((ill) => ({
        ...ill,
        is_selected: false,
      }));
      updatedIllustrations.unshift({
        media_url: result.publicUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      });

      updatePropState(propKey, stateData.key, {
        illustrations: updatedIllustrations,
      });
      setSelectedIllustrationIndex(0);
      toast.success("Image uploaded successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      log.error("handleUpload", "upload failed", { error: msg });
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteState = () => {
    log.info("handleDeleteState", "delete state", {
      propKey,
      stateKey: stateData.key,
    });
    deletePropState(propKey, stateData.key);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      {/* State header row */}
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-2 border-b border-border/50",
          isExpanded && "bg-muted/30"
        )}
      >
        {/* Expand/collapse chevron + name + key */}
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer group">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate">
                  {stateData.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    log.warn("handleRename", "Rename not implemented yet");
                  }}
                  title="Rename state"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                /{stateData.key}
              </span>
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Hidden file input for upload */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={handleFileSelected}
            className="hidden"
          />
          {/* Upload button — available for all states */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={isUploading}
            onClick={(e) => {
              e.stopPropagation();
              handleUploadClick();
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? "Uploading..." : "Upload"}
          </Button>

          {/* Delete button — only for non-default states */}
          {!isDefault && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                  title="Delete state"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete State</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the state &ldquo;
                    {stateData.name}&rdquo;? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDeleteState}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="space-y-4 px-3 pt-3 pb-3">
          {/* Image Preview + Thumbnail Gallery row — all left-aligned */}
          <div className="flex items-start gap-3">
            {/* Main Preview — fixed 480px wide */}
            <div className="shrink-0 w-[480px] h-[360px]">
              {selectedIllustration ? (
                <div className="relative w-full h-full">
                  <img
                    key={selectedIllustration.media_url}
                    src={selectedIllustration.media_url}
                    alt={stateData.name}
                    className="w-full h-full rounded-md object-contain"
                  />
                  {/* Zoom overlay — click to open fullscreen zoom dialog */}
                  <ImageZoomPreview
                    src={selectedIllustration.media_url}
                    alt={stateData.name}
                    className="absolute inset-0 h-full w-full rounded-md"
                    disabled={isGenerating}
                  />
                  {/* Generating overlay */}
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center z-20">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Generating...
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Floating action buttons — bottom-right on image */}
                  <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAttachCurrentImage}
                      disabled={isGenerating}
                      aria-label="Edit / attach to prompt"
                    >
                      <Pencil className="h-4 w-4" />
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
                <div className="w-full h-full rounded-lg bg-muted flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">No images generated</p>
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail Gallery — left-aligned, fixed size thumbnails */}
            <div className="shrink-0">
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">LATEST</Label>
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto p-0.5">
                {sortedIllustrations.length > 0 ? (
                  sortedIllustrations.map((ill) => {
                    const originalIdx = stateData.illustrations.indexOf(ill);
                    return (
                      <button
                        key={ill.media_url}
                        className={cn(
                          "relative rounded-md transition-all w-[120px] h-[120px]",
                          originalIdx === selectedIllustrationIndex
                            ? "ring-2 ring-primary"
                            : "ring-1 ring-border hover:scale-105"
                        )}
                        onClick={() => {
                          log.debug("thumbnail click", "select illustration", {
                            originalIdx,
                          });
                          setSelectedIllustrationIndex(originalIdx);
                        }}
                      >
                        <img
                          src={ill.media_url}
                          alt=""
                          className="w-full h-full object-contain rounded-md"
                        />
                        {originalIdx === selectedIllustrationIndex && (
                          <div className="absolute top-1.5 left-1.5">
                            <div className="rounded-full bg-primary p-1">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                    No images yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prompt Section — matching edit-image modal style */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">PROMPT</Label>
              {attachedImage && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs">
                  <span className="truncate max-w-[150px]">
                    {attachedImage.label}
                  </span>
                  <button
                    onClick={() => {
                      log.debug("removeAttachedImage", "remove attached");
                      setAttachedImage(null);
                    }}
                    className="hover:bg-blue-100 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={handleAttachFile}
                disabled={isGenerating}
                aria-label="Attach reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Describe the visual appearance..."
              className="min-h-[80px]"
              disabled={isGenerating}
            />
          </div>

          {/* Action buttons row — centered like edit-image modal */}
          <div className="flex justify-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !promptText.trim()}
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
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
