import { useRef } from "react";
import { Sparkles, Loader2, Paperclip, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AttachedFile } from "@/types/editor";
import { FILE_CONSTRAINTS } from "@/types/editor";
import { validateFiles, mergeAttachments, truncateFilename } from "@/lib/file-utils";

interface PromptPanelProps {
  promptValue: string;
  attachments: AttachedFile[];
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onAttachmentsChange: (files: AttachedFile[]) => void;
  onGenerate: () => void;
}

function FileChip({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: () => void;
}) {
  const displayName = truncateFilename(file.name);

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
      title={file.name}
    >
      <FileText className="h-3 w-3 text-muted-foreground" />
      <span className="max-w-[100px] truncate">{displayName}</span>
      <button
        onClick={onRemove}
        className="ml-1 rounded-sm hover:bg-destructive/20"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function PromptPanel({
  promptValue,
  attachments,
  isGenerating,
  onPromptChange,
  onAttachmentsChange,
  onGenerate,
}: PromptPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const { valid, rejected } = validateFiles(e.target.files);

    // Log rejected files to console
    if (rejected.length > 0) {
      console.warn('Some files were not added:', rejected);
      // TODO: Show user-friendly notification when toast component is available
    }

    if (valid.length > 0) {
      const merged = mergeAttachments(attachments, valid);
      onAttachmentsChange(merged);
    }

    e.target.value = ''; // Reset for re-selection
  };

  const handleRemoveFile = (fileId: string) => {
    onAttachmentsChange(attachments.filter((f) => f.id !== fileId));
  };

  return (
    <div className="space-y-3 p-3">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          PROMPT
        </Label>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating || attachments.length >= FILE_CONSTRAINTS.maxFiles}
          aria-label="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_CONSTRAINTS.acceptedExtensions}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <FileChip
              key={file.id}
              file={file}
              onRemove={() => handleRemoveFile(file.id)}
            />
          ))}
        </div>
      )}

      {/* Textarea */}
      <Textarea
        value={promptValue}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Enter your prompt for this manuscript..."
        className="min-h-[80px] resize-none"
        disabled={isGenerating}
      />

      {/* Generate button */}
      <Button
        onClick={onGenerate}
        disabled={isGenerating || !promptValue.trim()}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate
          </>
        )}
      </Button>
    </div>
  );
}
