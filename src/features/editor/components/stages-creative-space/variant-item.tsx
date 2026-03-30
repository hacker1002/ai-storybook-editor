// variant-item.tsx - Accordion item for a single stage variant with image gallery + attribute sections + generate/edit

import { useMemo, useRef, useState } from 'react';
import { useEras } from '@/stores/era-store';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/alert-dialog';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Upload,
  Paperclip,
  X,
  Check,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useSnapshotActions, useStageByKey, useImageTasksForChild } from '@/stores/snapshot-store/selectors';
import { useLocations } from '@/stores/location-store';
import { useReferenceImagePicker } from '@/features/editor/hooks/use-reference-image-picker';
import { useArtStyleDescription } from '@/stores/art-style-store';
import type { StageVariant } from '@/types/stage-types';
import { uploadImageToStorage } from '@/apis/storage-api';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { toast } from 'sonner';
import { VariantAttributeSections } from './variant-attribute-sections';
import { VariantItemImageArea } from './variant-item-image-area';

const log = createLogger('Editor', 'VariantItem');

interface VariantItemProps {
  stageKey: string;
  variantData: StageVariant;
  isExpanded: boolean;
  onToggle: () => void;
}

export function VariantItem({ stageKey, variantData, isExpanded, onToggle }: VariantItemProps) {
  const { deleteStageVariant, updateStageVariant, startGenerateTask, startEditTask } = useSnapshotActions();
  const stage = useStageByKey(stageKey);
  const locations = useLocations();
  const eras = useEras();
  const eraByName = useMemo(() => new Map(eras.map((e) => [e.name, e])), [eras]);
  const artStyleDescription = useArtStyleDescription();
  const { isProcessing } = useImageTasksForChild(stageKey, variantData.key);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(variantData.name);

  // Determine initial selected index: prefer is_selected=true, else 0
  const initSelectedIdx = () => {
    const idx = variantData.illustrations.findIndex((ill) => ill.is_selected);
    return idx >= 0 ? idx : 0;
  };

  const [selectedIllustrationIndex, setSelectedIllustrationIndex] = useState<number>(initSelectedIdx);
  const [promptText, setPromptText] = useState<string>(variantData.visual_description ?? '');
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false);
  const [editPromptText, setEditPromptText] = useState('');

  const generateRefs = useReferenceImagePicker();
  const editRefs = useReferenceImagePicker();

  // type 0 = base variant, cannot be deleted
  const isBase = variantData.type === 0;

  const sortedIllustrations = [...variantData.illustrations].sort(
    (a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
  );

  const selectedIllustration = variantData.illustrations[selectedIllustrationIndex];

  const handleBlurSave = () => {
    const trimmed = promptText.trim();
    if (trimmed === (variantData.visual_description ?? '')) return;
    log.debug('handleBlurSave', 'save visual_description', { stageKey, variantKey: variantData.key });
    updateStageVariant(stageKey, variantData.key, { visual_description: trimmed });
  };

  // Resolve base variant image URL for non-base variants
  const baseStageImageUrl = !isBase
    ? stage?.variants.find((s) => s.type === 0)?.illustrations.find((ill) => ill.is_selected)?.media_url
    : undefined;

  // Non-base variants cannot generate without base illustration
  const isGenerateDisabled = isProcessing || !promptText.trim() || (!isBase && !baseStageImageUrl);

  // Resolve era description from era store
  const resolvedEraDescription = variantData.temporal.era
    ? eraByName.get(variantData.temporal.era)?.description ?? undefined
    : undefined;

  const handleGenerate = () => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || isProcessing) return;

    log.info('handleGenerate', 'start', { stageKey, variantKey: variantData.key, isBase });
    updateStageVariant(stageKey, variantData.key, { visual_description: trimmedPrompt });

    const referenceImages =
      generateRefs.images.length > 0
        ? generateRefs.images.map(({ base64Data, mimeType }) => ({ base64Data, mimeType }))
        : undefined;

    const location = locations.find((l) => l.id === stage?.location_id);

    if (isBase) {
      startGenerateTask({
        entityType: 'stage',
        isBase: true,
        entityKey: stageKey,
        entityName: stage?.name ?? stageKey,
        childKey: variantData.key,
        childName: variantData.name,
        stageKey,
        stageName: stage?.name ?? stageKey,
        locationDescription: location?.description ?? location?.name ?? '',
        eraDescription: resolvedEraDescription,
        baseSetting: {
          visual_description: trimmedPrompt,
          temporal: variantData.temporal,
          sensory: variantData.sensory,
          emotional: variantData.emotional,
        },
        artStyleDescription: artStyleDescription ?? '',
        referenceImages,
      });
    } else {
      if (!baseStageImageUrl) return;
      startGenerateTask({
        entityType: 'stage',
        isBase: false,
        entityKey: stageKey,
        entityName: stage?.name ?? stageKey,
        childKey: variantData.key,
        childName: variantData.name,
        variantKey: variantData.key,
        variantVisualDescription: trimmedPrompt,
        variantTemporal: variantData.temporal,
        variantSensory: variantData.sensory,
        variantEmotional: variantData.emotional,
        eraDescription: resolvedEraDescription,
        baseStageImageUrl,
        artStyleDescription: artStyleDescription ?? '',
        additionalReferenceImages: referenceImages,
      });
    }

    generateRefs.clearImages();
  };

  const handleEditImage = () => {
    const trimmed = editPromptText.trim();
    if (!trimmed || !selectedIllustration || isProcessing) return;

    log.info('handleEditImage', 'start', {
      stageKey,
      variantKey: variantData.key,
      prompt: trimmed,
      refCount: editRefs.images.length,
    });
    setIsEditPopoverOpen(false);

    const referenceImages =
      editRefs.images.length > 0
        ? editRefs.images.map(({ base64Data, mimeType }) => ({ base64Data, mimeType }))
        : undefined;

    startEditTask({
      entityType: 'stage',
      entityKey: stageKey,
      entityName: stage?.name ?? stageKey,
      childKey: variantData.key,
      childName: variantData.name,
      prompt: trimmed,
      imageUrl: selectedIllustration.media_url,
      referenceImages,
    });

    setEditPromptText('');
    editRefs.clearImages();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    log.info('handleUpload', 'start upload', {
      stageKey,
      variantKey: variantData.key,
      fileName: file.name,
      size: file.size,
    });
    setIsUploading(true);
    try {
      const result = await uploadImageToStorage(file, `stages/${stageKey}/${variantData.key}`);
      log.info('handleUpload', 'upload complete', { publicUrl: result.publicUrl });

      const updatedIllustrations = variantData.illustrations.map((ill) => ({
        ...ill,
        is_selected: false,
      }));
      updatedIllustrations.unshift({
        media_url: result.publicUrl,
        created_time: new Date().toISOString(),
        is_selected: true,
      });

      updateStageVariant(stageKey, variantData.key, { illustrations: updatedIllustrations });
      setSelectedIllustrationIndex(0);
      toast.success('Image uploaded successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      log.error('handleUpload', 'upload failed', { error: msg });
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVariant = () => {
    log.info('handleDeleteVariant', 'delete variant', { stageKey, variantKey: variantData.key });
    deleteStageVariant(stageKey, variantData.key);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      {/* Variant header row */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-2 border-b border-border/50',
          isExpanded && 'bg-muted/30'
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
                        if (renameValue.trim() && renameValue.trim() !== variantData.name) {
                          log.info('handleRename', 'renamed', { variantKey: variantData.key, newName: renameValue.trim() });
                          updateStageVariant(stageKey, variantData.key, { name: renameValue.trim() });
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
                      if (renameValue.trim() && renameValue.trim() !== variantData.name) {
                        log.info('handleRename', 'renamed', { variantKey: variantData.key, newName: renameValue.trim() });
                        updateStageVariant(stageKey, variantData.key, { name: renameValue.trim() });
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
                    <span className="font-medium text-sm truncate">{variantData.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameValue(variantData.name);
                        setIsRenaming(true);
                        log.debug('handleStartRename', 'start', { variantKey: variantData.key });
                      }}
                      title="Rename variant"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">/{variantData.key}</span>
                </>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={handleFileSelected}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={isUploading}
            onClick={(e) => {
              e.stopPropagation();
              uploadInputRef.current?.click();
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>

          {!isBase && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                  title="Delete variant"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Variant</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the variant &ldquo;{variantData.name}&rdquo;? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDeleteVariant}
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
          {/* Image preview + thumbnail gallery */}
          <VariantItemImageArea
            variantName={variantData.name}
            illustrations={variantData.illustrations}
            sortedIllustrations={sortedIllustrations}
            selectedIllustrationIndex={selectedIllustrationIndex}
            selectedIllustration={selectedIllustration}
            isProcessing={isProcessing}
            isEditPopoverOpen={isEditPopoverOpen}
            editPromptText={editPromptText}
            editRefImages={editRefs.images}
            onSelectIllustration={setSelectedIllustrationIndex}
            onDownload={() => {
              if (!selectedIllustration) return;
              log.debug('handleDownload', 'open in new tab', { url: selectedIllustration.media_url });
              window.open(selectedIllustration.media_url, '_blank');
            }}
            onEditPopoverOpenChange={setIsEditPopoverOpen}
            onEditPromptChange={setEditPromptText}
            onEditSubmit={handleEditImage}
            onEditRefPickerOpen={editRefs.openPicker}
            onEditRefRemove={editRefs.removeImage}
            editRefInputRef={editRefs.inputRef}
            editRefHandleFilesSelected={editRefs.handleFilesSelected}
          />

          {/* Visual Description Section */}
          <div>
            <input
              ref={generateRefs.inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={generateRefs.handleFilesSelected}
              className="hidden"
            />
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground">VISUAL DESCRIPTION</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={generateRefs.openPicker}
                disabled={isProcessing}
                aria-label="Attach reference image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {generateRefs.images.length > 0 && (
                <span className="text-xs text-muted-foreground">{generateRefs.images.length}/5</span>
              )}
            </div>
            {generateRefs.images.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {generateRefs.images.map((img, idx) => (
                  <div
                    key={`${img.label}-${idx}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                  >
                    <span className="truncate max-w-[120px]">{img.label}</span>
                    <button onClick={() => generateRefs.removeImage(idx)} className="hover:bg-blue-100 rounded">
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

          {/* Generate button */}
          <div className="flex flex-col items-center gap-1">
            <Button
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
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
            {!isBase && !baseStageImageUrl && (
              <span className="text-xs text-muted-foreground">Generate base variant first</span>
            )}
          </div>

          {/* Attribute Sections — Temporal / Sensory / Emotional */}
          <VariantAttributeSections
            stageKey={stageKey}
            variantKey={variantData.key}
            temporal={variantData.temporal}
            sensory={variantData.sensory}
            emotional={variantData.emotional}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
