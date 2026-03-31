// branch-card.tsx - Individual branch option card with image, title, and section selection

import { useRef } from 'react';
import { Star, X, ImagePlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import type { DraftBranch, Section } from './branch-types';

const log = createLogger('Editor', 'BranchCard');

interface BranchCardProps {
  index: number;
  branch: DraftBranch;
  isDefault: boolean;
  canDelete: boolean;
  isUploading: boolean;
  sections: Section[];
  onSetDefault: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<DraftBranch>) => void;
  onImageUpload: (file: File) => void;
}

export function BranchCard({
  index,
  branch,
  isDefault,
  canDelete,
  isUploading,
  sections,
  onSetDefault,
  onDelete,
  onUpdate,
  onImageUpload,
}: BranchCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  log.debug('render', 'rendering branch card', { index, isDefault });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    log.info('handleFileChange', 'image selected', { name: file.name, size: file.size });
    onImageUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  return (
    <div className="flex min-h-[280px] w-[220px] shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      {/* Header: number badge + delete button */}
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {index + 1}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              log.info('onDelete', 'delete branch', { index });
              onDelete();
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Default toggle */}
      <button
        type="button"
        onClick={() => {
          log.info('onSetDefault', 'set default branch', { index });
          onSetDefault();
        }}
        className={cn(
          'flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs transition-colors',
          isDefault
            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <Star
          className={cn(
            'h-3.5 w-3.5',
            isDefault ? 'fill-yellow-500 text-yellow-500' : 'fill-none',
          )}
        />
        <span>{isDefault ? 'Mặc định' : 'Đặt mặc định'}</span>
      </button>

      {/* Image upload area */}
      <div
        className={cn(
          'flex h-[120px] flex-col items-center justify-center gap-1',
          'rounded border-2 border-dashed border-border bg-muted/20 transition-colors',
          isUploading ? 'cursor-wait' : 'cursor-pointer hover:bg-muted/40',
        )}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Đang tải...</span>
          </>
        ) : branch.imageUrl ? (
          <img
            src={branch.imageUrl}
            alt={`Branch ${index + 1}`}
            className="h-full w-full rounded object-cover"
          />
        ) : (
          <>
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Upload</span>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Title input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Tiêu đề</label>
        <Input
          value={branch.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Nhập tiêu đề..."
          className="h-8 text-sm"
        />
      </div>

      {/* Section select */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Section đích</label>
        <Select
          value={branch.sectionId || undefined}
          onValueChange={(val) => {
            log.debug('onSectionChange', 'section selected', { index, sectionId: val });
            onUpdate({ sectionId: val });
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Chọn section..." />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
