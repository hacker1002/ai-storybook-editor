// Reusable file drop zone — click to pick or drag-drop a single file.
// Renders a "picked file" card with remove button when a file is selected.

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Music, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'FileDropzone');

export interface FileDropzoneProps {
  file: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  accept: string;
  disabled?: boolean;
  /** Optional descriptive label shown under filename, e.g. "1.2 MB · 3.4s". */
  metaLabel?: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function FileDropzone({
  file,
  onPick,
  onRemove,
  accept,
  disabled = false,
  metaLabel,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      log.debug('handleChange', 'file picked via input', { name: f.name, size: f.size });
      onPick(f);
    }
    // Reset input so same file can be re-picked after remove.
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) {
      log.debug('handleDrop', 'drop ignored (disabled)');
      return;
    }
    const f = e.dataTransfer.files?.[0];
    if (f) {
      log.debug('handleDrop', 'file picked via drop', { name: f.name, size: f.size });
      onPick(f);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  if (file) {
    const sizeLabel = formatSize(file.size);
    const label = metaLabel ? `${sizeLabel} · ${metaLabel}` : sizeLabel;
    return (
      <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
        <Music className="h-5 w-5 text-primary shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm">{file.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove file"
          onClick={onRemove}
          disabled={disabled}
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      disabled={disabled}
      className={cn(
        'w-full rounded-md border-2 border-dashed p-6 text-center transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging ? 'border-primary bg-primary/5' : 'bg-muted/30 hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm">Click to upload audio file</p>
      <p className="text-xs text-muted-foreground">(or drag & drop here)</p>
    </button>
  );
}
