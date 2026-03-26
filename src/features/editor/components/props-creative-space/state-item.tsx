// state-item.tsx - Accordion item for a single prop state with image gallery + prompt section

import { useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
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
  Send,
} from "lucide-react";
import { ImageZoomPreview } from "@/components/ui/image-zoom-preview";
import { Label } from "@/components/ui/label";
import { useSnapshotActions, usePropByKey, useImageTasksForChild } from "@/stores/snapshot-store";
import { useAssetCategories } from "@/stores/asset-category-store";
import { fileToBase64 } from "@/utils/file-utils";
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
  const { deletePropState, updatePropState, startGenerateTask, startEditTask } = useSnapshotActions();
  const prop = usePropByKey(propKey);
  const categories = useAssetCategories();
  const { isProcessing } = useImageTasksForChild(propKey, stateData.key);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(stateData.name);

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
  const [attachedImages, setAttachedImages] = useState<
    Array<{ label: string; base64Data: string; mimeType: string }>
  >([]);
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false);
  const [editPromptText, setEditPromptText] = useState("");
  const [editAttachedImages, setEditAttachedImages] = useState<
    Array<{ label: string; base64Data: string; mimeType: string }>
  >([]);
  const editReferenceInputRef = useRef<HTMLInputElement>(null);

  const MAX_REFERENCE_IMAGES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // type 0 = default state, cannot be deleted or have images uploaded
  const isDefault = stateData.type === 0;

  const sortedIllustrations = [...stateData.illustrations].sort(
    (a, b) =>
      new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
  );

  const selectedIllustration =
    stateData.illustrations[selectedIllustrationIndex];

  const handleBlurSave = () => {
    const trimmed = promptText.trim();
    if (trimmed === (stateData.visual_description ?? "")) return;
    log.debug("handleBlurSave", "save visual_description", {
      propKey,
      stateKey: stateData.key,
    });
    updatePropState(propKey, stateData.key, { visual_description: trimmed });
  };

  const handleDownload = () => {
    if (!selectedIllustration) return;
    log.debug("handleDownload", "open in new tab", {
      url: selectedIllustration.media_url,
    });
    window.open(selectedIllustration.media_url, "_blank");
  };

  const handleEditImage = () => {
    const trimmed = editPromptText.trim();
    if (!trimmed || !selectedIllustration || isProcessing) return;

    log.info("handleEditImage", "start", {
      propKey,
      stateKey: stateData.key,
      prompt: trimmed,
      refCount: editAttachedImages.length,
    });
    setIsEditPopoverOpen(false);

    const referenceImages =
      editAttachedImages.length > 0
        ? editAttachedImages.map(({ base64Data, mimeType }) => ({
            base64Data,
            mimeType,
          }))
        : undefined;

    startEditTask({
      entityType: 'prop',
      entityKey: propKey,
      entityName: prop?.name ?? propKey,
      childKey: stateData.key,
      childName: stateData.name,
      prompt: trimmed,
      imageUrl: selectedIllustration.media_url,
      referenceImages,
    });

    setEditPromptText("");
    setEditAttachedImages([]);
  };

  const handleEditAttachFile = () => {
    editReferenceInputRef.current?.click();
  };

  const handleEditReferenceFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    e.target.value = "";

    const remaining = MAX_REFERENCE_IMAGES - editAttachedImages.length;
    if (remaining <= 0) {
      toast.warning(`Maximum ${MAX_REFERENCE_IMAGES} reference images allowed`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of fileArray) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        toast.warning(`${file.name}: only PNG, JPEG, WebP accepted`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.warning(`${file.name}: exceeds 10MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    const toProcess = validFiles.slice(0, remaining);
    if (validFiles.length > remaining) {
      toast.warning(
        `Only ${remaining} more reference image(s) can be added (max ${MAX_REFERENCE_IMAGES})`
      );
    }

    try {
      const newImages = await Promise.all(
        toProcess.map(async (file) => ({
          label: file.name,
          base64Data: await fileToBase64(file),
          mimeType: file.type,
        }))
      );
      setEditAttachedImages((prev) => [...prev, ...newImages]);
    } catch (err) {
      log.error("handleEditReferenceFiles", "conversion failed", {
        error: err,
      });
      toast.error("Failed to process reference image(s)");
    }
  };

  const handleAttachFile = () => {
    referenceInputRef.current?.click();
  };

  const handleReferenceFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Snapshot to array BEFORE resetting input — FileList is a live reference
    const fileArray = Array.from(files);
    e.target.value = "";

    const remaining = MAX_REFERENCE_IMAGES - attachedImages.length;
    if (remaining <= 0) {
      toast.warning(`Maximum ${MAX_REFERENCE_IMAGES} reference images allowed`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of fileArray) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        log.warn("handleReferenceFiles", "invalid mime type", {
          name: file.name,
          type: file.type,
        });
        toast.warning(`${file.name}: only PNG, JPEG, WebP accepted`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        log.warn("handleReferenceFiles", "file too large", {
          name: file.name,
          size: file.size,
        });
        toast.warning(`${file.name}: exceeds 10MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    const toProcess = validFiles.slice(0, remaining);
    if (validFiles.length > remaining) {
      toast.warning(
        `Only ${remaining} more reference image(s) can be added (max ${MAX_REFERENCE_IMAGES})`
      );
    }

    log.debug("handleReferenceFiles", "converting files", {
      count: toProcess.length,
    });
    try {
      const newImages = await Promise.all(
        toProcess.map(async (file) => ({
          label: file.name,
          base64Data: await fileToBase64(file),
          mimeType: file.type,
        }))
      );
      setAttachedImages((prev) => [...prev, ...newImages]);
    } catch (err) {
      log.error("handleReferenceFiles", "conversion failed", { error: err });
      toast.error("Failed to process reference image(s)");
    }
  };

  const buildDescription = (visualDescription: string): string => {
    const categoryName = prop?.category_id
      ? categories.find((c) => c.id === prop.category_id)?.name
      : undefined;
    if (categoryName) {
      return `Đối tượng thuộc nhóm ${categoryName}.\nMô tả: ${visualDescription}`;
    }
    return visualDescription;
  };

  const handleGenerate = () => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || isProcessing) return;

    log.info("handleGenerate", "start", { propKey, stateKey: stateData.key });

    // Save visual_description to store first (covers blur-skip edge case)
    updatePropState(propKey, stateData.key, {
      visual_description: trimmedPrompt,
    });

    const description = buildDescription(trimmedPrompt);
    const referenceImages =
      attachedImages.length > 0
        ? attachedImages.map(({ base64Data, mimeType }) => ({
            base64Data,
            mimeType,
          }))
        : undefined;

    log.debug("handleGenerate", "dispatching to store", {
      descriptionLength: description.length,
      refCount: referenceImages?.length ?? 0,
    });

    startGenerateTask({
      entityType: 'prop',
      entityKey: propKey,
      entityName: prop?.name ?? propKey,
      childKey: stateData.key,
      childName: stateData.name,
      description,
      referenceImages,
    });

    setAttachedImages([]);
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
              {isRenaming ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    className="h-7 text-sm flex-1"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameValue.trim() && renameValue.trim() !== stateData.name) {
                          log.info('handleRename', 'renamed', { stateKey: stateData.key, newName: renameValue.trim() });
                          updatePropState(propKey, stateData.key, { name: renameValue.trim() });
                        }
                        setIsRenaming(false);
                      }
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      if (renameValue.trim() && renameValue.trim() !== stateData.name) {
                        log.info('handleRename', 'renamed', { stateKey: stateData.key, newName: renameValue.trim() });
                        updatePropState(propKey, stateData.key, { name: renameValue.trim() });
                      }
                      setIsRenaming(false);
                    }}
                    aria-label="Accept rename"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setIsRenaming(false)}
                    aria-label="Cancel rename"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
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
                        setRenameValue(stateData.name);
                        setIsRenaming(true);
                        log.debug('handleStartRename', 'start', { stateKey: stateData.key });
                      }}
                      title="Rename state"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    /{stateData.key}
                  </span>
                </>
              )}
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
          {/* Hidden file input for edit popover references */}
          <input
            ref={editReferenceInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleEditReferenceFilesSelected}
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
                    disabled={isProcessing}
                  />
                  {/* Generating overlay */}
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
                  {/* Floating action buttons — bottom-right on image */}
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
                        {editAttachedImages.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {editAttachedImages.map((img, idx) => (
                              <div
                                key={`edit-${img.label}-${idx}`}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                              >
                                <span className="truncate max-w-[120px]">
                                  {img.label}
                                </span>
                                <button
                                  onClick={() =>
                                    setEditAttachedImages((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
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
                              onClick={handleEditAttachFile}
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

          {/* Visual Description Section */}
          <div>
            {/* Hidden file input for reference images */}
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleReferenceFilesSelected}
              className="hidden"
            />
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">
                VISUAL DESCRIPTION
              </Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={handleAttachFile}
                disabled={isProcessing}
                aria-label="Attach reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {attachedImages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {attachedImages.length}/{MAX_REFERENCE_IMAGES}
                </span>
              )}
            </div>
            {/* Attached reference images list */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachedImages.map((img, idx) => (
                  <div
                    key={`${img.label}-${idx}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                  >
                    <span className="truncate max-w-[120px]">{img.label}</span>
                    <button
                      onClick={() => {
                        log.debug("removeAttachedImage", "remove reference", {
                          idx,
                          label: img.label,
                        });
                        setAttachedImages((prev) =>
                          prev.filter((_, i) => i !== idx)
                        );
                      }}
                      className="hover:bg-blue-100 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onBlur={handleBlurSave}
              placeholder="Describe the visual appearance..."
              className="min-h-[80px]"
              disabled={isProcessing}
            />
          </div>

          {/* Action buttons row — centered like edit-image modal */}
          <div className="flex justify-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={isProcessing || !promptText.trim()}
              className="w-40"
            >
              {isProcessing ? (
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
