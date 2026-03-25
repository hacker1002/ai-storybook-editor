// state-item.tsx - Accordion item for a single prop state with image gallery + prompt section

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
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
  Download,
  Paperclip,
  X,
  Check,
  Sparkles,
  GripVertical,
  Image as ImageIcon,
} from 'lucide-react';
import { useSnapshotActions } from '@/stores/snapshot-store';
import type { PropState } from '@/types/prop-types';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';

const log = createLogger('Editor', 'StateItem');

interface StateItemProps {
  propKey: string;
  stateData: PropState;
  isExpanded: boolean;
  onToggle: () => void;
}

export function StateItem({ propKey, stateData, isExpanded, onToggle }: StateItemProps) {
  const { deletePropState } = useSnapshotActions();

  // Determine initial selected index: prefer is_selected=true, else 0
  const initSelectedIdx = () => {
    const idx = stateData.illustrations.findIndex((ill) => ill.is_selected);
    return idx >= 0 ? idx : 0;
  };

  const [selectedIllustrationIndex, setSelectedIllustrationIndex] = useState<number>(initSelectedIdx);
  const [promptText, setPromptText] = useState<string>(stateData.visual_description ?? '');
  const [attachedImage, setAttachedImage] = useState<{ label: string; url: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // type 0 = default state, cannot be deleted or have images uploaded
  const isDefault = stateData.type === 0;

  const sortedIllustrations = [...stateData.illustrations].sort(
    (a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
  );

  const selectedIllustration = stateData.illustrations[selectedIllustrationIndex];

  const handleAttachCurrentImage = () => {
    if (!selectedIllustration) return;
    log.debug('handleAttachCurrentImage', 'attach current', { url: selectedIllustration.media_url });
    setAttachedImage({ label: 'Current image', url: selectedIllustration.media_url });
  };

  const handleDownload = () => {
    if (!selectedIllustration) return;
    log.debug('handleDownload', 'open in new tab', { url: selectedIllustration.media_url });
    window.open(selectedIllustration.media_url, '_blank');
  };

  const handleAttachFile = () => {
    log.warn('handleAttachFile', 'File upload not implemented yet');
  };

  const handleGenerate = () => {
    log.warn('handleGenerate', 'Generate API not implemented yet');
    setIsGenerating(true);
    // Placeholder — in production this calls an API
    setTimeout(() => setIsGenerating(false), 1500);
  };

  const handleDeleteState = () => {
    log.info('handleDeleteState', 'delete state', { propKey, stateKey: stateData.key });
    deletePropState(propKey, stateData.key);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer group',
            'hover:bg-muted/50 transition-colors',
            isExpanded && 'bg-muted/30'
          )}
        >
          {/* Drag handle — decorative */}
          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />

          {/* State name */}
          <span className="font-medium text-sm truncate flex-1">{stateData.name}</span>

          {/* State key badge */}
          <span className="text-xs text-muted-foreground hidden group-hover:inline">
            /{stateData.key}
          </span>

          {/* Rename button — visible on hover, placeholder */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              log.warn('handleRename', 'Rename not implemented yet');
            }}
            title="Rename state"
          >
            <Pencil className="h-3 w-3" />
          </Button>

          {/* Upload button — only for non-default states */}
          {!isDefault && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                log.warn('handleUpload', 'Upload not implemented yet');
              }}
              title="Upload image"
            >
              <Upload className="h-3 w-3" />
            </Button>
          )}

          {/* Delete button — only for non-default states */}
          {!isDefault && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                  title="Delete state"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete State</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the state "{stateData.name}"? This action cannot be undone.
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

          {/* Expand/collapse chevron */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Image Preview + Thumbnail Gallery row */}
        <div className="flex gap-4 px-3 pt-2 pb-1">
          {/* Image Preview — flex-[6] */}
          <div className="flex-[6] relative">
            {selectedIllustration ? (
              <>
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={selectedIllustration.media_url}
                    alt={stateData.name}
                    className="w-full h-full object-contain"
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">Generating...</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 mt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleAttachCurrentImage}
                    title="Attach to prompt"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownload}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No images generated</p>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnail Gallery — flex-[4] */}
          <div className="flex-[4]">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Latest</p>
            <div className="grid grid-cols-2 gap-2 max-h-[328px] overflow-y-auto">
              {sortedIllustrations.map((ill, sortedIdx) => {
                // Map sorted index back to original index for selection tracking
                const originalIdx = stateData.illustrations.indexOf(ill);
                return (
                  <div
                    key={sortedIdx}
                    className={cn(
                      'relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition-colors',
                      originalIdx === selectedIllustrationIndex
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                    onClick={() => {
                      log.debug('thumbnail click', 'select illustration', { originalIdx });
                      setSelectedIllustrationIndex(originalIdx);
                    }}
                  >
                    <img src={ill.media_url} alt="" className="w-full h-full object-cover" />
                    {originalIdx === selectedIllustrationIndex && (
                      <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Prompt Section */}
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Prompt</p>
            {attachedImage && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs">
                {attachedImage.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    log.debug('removeAttachedImage', 'remove attached');
                    setAttachedImage(null);
                  }}
                />
              </span>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleAttachFile}
              title="Attach image"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Describe the visual appearance..."
            className="min-h-[80px] resize-none text-sm"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={isGenerating || !promptText.trim()}
            onClick={handleGenerate}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Generate
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
