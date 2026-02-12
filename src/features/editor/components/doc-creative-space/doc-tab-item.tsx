import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PromptPanel } from '../shared/prompt-panel';
import type { ManuscriptDoc, AttachedFile } from '@/types/editor';
import { cn } from '@/lib/utils';

interface DocTabItemProps {
  doc: ManuscriptDoc;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  canEditTitle: boolean;
  canDelete: boolean;
  promptInput: string;
  attachments: AttachedFile[];
  isGenerating: boolean;
  onToggle: () => void;
  onUpdateTitle: (title: string) => void;
  onDelete: () => void;
  onPromptChange: (value: string) => void;
  onAttachmentsChange: (files: AttachedFile[]) => void;
  onGenerate: () => void;
}

export function DocTabItem({
  doc,
  isActive,
  isExpanded,
  canEditTitle,
  canDelete,
  promptInput,
  attachments,
  isGenerating,
  onToggle,
  onUpdateTitle,
  onDelete,
  onPromptChange,
  onAttachmentsChange,
  onGenerate,
}: DocTabItemProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(doc.title);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canEditTitle) {
      setEditValue(doc.title);
      setIsEditingTitle(true);
    }
  };

  const handleSaveEdit = () => {
    if (editValue.trim()) {
      onUpdateTitle(editValue.trim());
    }
    setIsEditingTitle(false);
  };

  return (
    <div
      className={cn(
        'mb-1 overflow-hidden rounded-md border',
        isActive && 'border-primary/50 bg-accent/30',
        !isActive && 'border-transparent'
      )}
    >
      {/* Tab Header */}
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          'group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
          'transition-colors hover:bg-accent/50',
          isActive && 'font-medium'
        )}
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

        {isEditingTitle ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setIsEditingTitle(false);
            }}
            className="h-6 flex-1 py-0 text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{doc.title}</span>
        )}

        {/* Active indicator */}
        {isActive && !isExpanded && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}

        {/* Edit button (other type only) */}
        {canEditTitle && !isEditingTitle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStartEdit}
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}

        {/* Delete button (other type only) */}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}

        {/* Expand/collapse icon */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expandable PromptPanel */}
      {isExpanded && (
        <div className="border-t bg-background">
          <PromptPanel
            promptValue={promptInput}
            attachments={attachments}
            isGenerating={isGenerating}
            onPromptChange={onPromptChange}
            onAttachmentsChange={onAttachmentsChange}
            onGenerate={onGenerate}
          />
        </div>
      )}
    </div>
  );
}
