// edit-image-popover.tsx - Reusable popover for refining a generated image via prompt + reference images.
// Consumers in characters/props/stages variant items (and the upcoming remix swap modal) embed this
// to expose the floating pencil trigger anchored to the image preview's bottom-right corner.
//
// Controlled-only: callers own popover open state, prompt text, and the reference-image list.
// The hidden <input type="file"> for attaching reference images MUST be rendered by the caller
// outside PopoverContent — when the popover closes, its subtree unmounts and would cancel the
// in-flight file picker. This component only fires `onAttachClick` and the caller wires it to
// `useReferenceImagePicker.openPicker`.

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Paperclip, Send, X } from 'lucide-react';

export interface EditImagePopoverReference {
  label: string;
}

export interface EditImagePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptValue: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  referenceImages: EditImagePopoverReference[];
  onAttachClick: () => void;
  onRemoveReference: (index: number) => void;
  disabled?: boolean;
  triggerAriaLabel?: string;
}

export function EditImagePopover({
  open,
  onOpenChange,
  promptValue,
  onPromptChange,
  onSubmit,
  referenceImages,
  onAttachClick,
  onRemoveReference,
  disabled = false,
  triggerAriaLabel = 'Edit image',
}: EditImagePopoverProps) {
  const canSubmit = promptValue.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={triggerAriaLabel}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 p-3">
        {referenceImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {referenceImages.map((img, idx) => (
              <div
                key={`edit-ref-${img.label}-${idx}`}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
              >
                <span className="truncate max-w-[120px]">{img.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveReference(idx)}
                  className="hover:bg-blue-100 rounded"
                  aria-label={`Remove reference image ${img.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={promptValue}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe changes..."
            className="min-h-[60px] flex-1 resize-none text-sm"
            aria-label="Edit image prompt"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSubmit) onSubmit();
              }
            }}
          />
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onAttachClick}
              aria-label="Attach reference image"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8"
              disabled={!canSubmit}
              onClick={onSubmit}
              aria-label="Submit edit"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
