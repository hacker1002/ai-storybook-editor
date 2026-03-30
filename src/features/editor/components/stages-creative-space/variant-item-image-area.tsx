// variant-item-image-area.tsx - Image preview + thumbnail gallery + edit popover for a stage variant item

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Pencil,
  Download,
  X,
  Check,
  Image as ImageIcon,
  Send,
  Paperclip,
} from 'lucide-react';
import { ImageZoomPreview } from '@/components/ui/image-zoom-preview';
import type { Illustration } from '@/types/prop-types';
import { cn } from '@/utils/utils';

// Logger omitted: pure presentational component; parent VariantItem handles logging

interface VariantItemImageAreaProps {
  variantName: string;
  illustrations: Illustration[];
  sortedIllustrations: Illustration[];
  selectedIllustrationIndex: number;
  selectedIllustration: Illustration | undefined;
  isProcessing: boolean;
  isEditPopoverOpen: boolean;
  editPromptText: string;
  editRefImages: { label: string }[];
  onSelectIllustration: (originalIdx: number) => void;
  onDownload: () => void;
  onEditPopoverOpenChange: (open: boolean) => void;
  onEditPromptChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditRefPickerOpen: () => void;
  onEditRefRemove: (idx: number) => void;
  editRefInputRef: React.RefObject<HTMLInputElement | null>;
  editRefHandleFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function VariantItemImageArea({
  variantName,
  illustrations,
  sortedIllustrations,
  selectedIllustrationIndex,
  selectedIllustration,
  isProcessing,
  isEditPopoverOpen,
  editPromptText,
  editRefImages,
  onSelectIllustration,
  onDownload,
  onEditPopoverOpenChange,
  onEditPromptChange,
  onEditSubmit,
  onEditRefPickerOpen,
  onEditRefRemove,
  editRefInputRef,
  editRefHandleFilesSelected,
}: VariantItemImageAreaProps) {
  return (
    <div className="flex items-start gap-3">
      {/* Main Preview — fixed 480px wide */}
      <div className="shrink-0 w-[480px] h-[360px]">
        {selectedIllustration ? (
          <div className="relative w-full h-full">
            <img
              key={selectedIllustration.media_url}
              src={selectedIllustration.media_url}
              alt={variantName}
              className="w-full h-full rounded-md object-contain"
            />
            {/* Zoom overlay */}
            <ImageZoomPreview
              src={selectedIllustration.media_url}
              alt={variantName}
              className="absolute inset-0 h-full w-full rounded-md"
              disabled={isProcessing}
            />
            {/* Generating overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-white/80 rounded-md flex items-center justify-center z-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Generating...</p>
                </div>
              </div>
            )}
            {/* Floating action buttons */}
            <div className="absolute bottom-2 right-2 flex gap-2 z-20">
              <Popover open={isEditPopoverOpen} onOpenChange={onEditPopoverOpenChange}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={isProcessing} aria-label="Edit image">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-80 p-3">
                  {editRefImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editRefImages.map((img, idx) => (
                        <div
                          key={`edit-${img.label}-${idx}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                        >
                          <span className="truncate max-w-[120px]">{img.label}</span>
                          <button onClick={() => onEditRefRemove(idx)} className="hover:bg-blue-100 rounded">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Textarea
                      value={editPromptText}
                      onChange={(e) => onEditPromptChange(e.target.value)}
                      placeholder="Describe changes..."
                      className="min-h-[60px] flex-1 resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          onEditSubmit();
                        }
                      }}
                    />
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={onEditRefPickerOpen}
                        aria-label="Attach reference image"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        disabled={!editPromptText.trim()}
                        onClick={onEditSubmit}
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
                onClick={onDownload}
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

      {/* Hidden file input for edit reference images */}
      <input
        ref={editRefInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={editRefHandleFilesSelected}
        className="hidden"
      />

      {/* Thumbnail Gallery */}
      <div className="shrink-0">
        <div className="mb-2">
          <Label className="text-xs text-muted-foreground">LATEST</Label>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto p-0.5">
          {sortedIllustrations.length > 0 ? (
            sortedIllustrations.map((ill) => {
              const originalIdx = illustrations.indexOf(ill);
              return (
                <button
                  key={ill.media_url}
                  className={cn(
                    'relative rounded-md transition-all w-[120px] h-[120px]',
                    originalIdx === selectedIllustrationIndex
                      ? 'ring-2 ring-primary'
                      : 'ring-1 ring-border hover:scale-105'
                  )}
                  onClick={() => onSelectIllustration(originalIdx)}
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
  );
}
