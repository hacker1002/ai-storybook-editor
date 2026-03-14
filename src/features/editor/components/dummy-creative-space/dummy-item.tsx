import { useState, useEffect } from "react";
import { Pencil, ChevronDown, Copy, Trash, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { PromptPanel } from "@/features/editor/components/editor-shared/prompt-panel";
import type { ManuscriptDoc, AttachedFile } from "@/types/editor";
import type { ManuscriptDummy } from "@/types/dummy";
import { cn } from "@/utils/utils";

interface DummyItemProps {
  dummy: ManuscriptDummy;
  isSelected: boolean;
  isExpanded: boolean;
  docs: ManuscriptDoc[];
  selectedScriptId: string | undefined;
  promptValue: string;
  attachments: AttachedFile[];
  isGenerating: boolean;
  editingTitle: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onTitleChange: (title: string) => void;
  onEditTitleToggle: () => void;
  onScriptChange: (scriptId: string) => void;
  onPromptChange: (value: string) => void;
  onAttachmentsChange: (files: AttachedFile[]) => void;
  onGenerate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function DummyItem({
  dummy,
  isSelected,
  isExpanded,
  docs,
  selectedScriptId,
  promptValue,
  attachments,
  isGenerating,
  editingTitle,
  onSelect,
  onToggle,
  onTitleChange,
  onEditTitleToggle,
  onScriptChange,
  onPromptChange,
  onAttachmentsChange,
  onGenerate,
  onDuplicate,
  onDelete,
}: DummyItemProps) {
  const [localTitle, setLocalTitle] = useState(dummy.title);

  // Sync local title when dummy.title changes externally (e.g., after generation)
  useEffect(() => {
    setLocalTitle(dummy.title);
  }, [dummy.title]);

  const handleTitleSave = () => {
    if (localTitle.trim()) {
      onTitleChange(localTitle.trim());
    } else {
      setLocalTitle(dummy.title);
    }
    onEditTitleToggle();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setLocalTitle(dummy.title);
      onEditTitleToggle();
    }
  };

  // Filter docs to only script type
  const scriptDocs = docs.filter((doc) => doc.type === "script");

  const handleHeaderClick = (e: React.MouseEvent) => {
    // Don't select/expand if clicking on pencil button or its children
    const target = e.target as HTMLElement;
    if (target.closest("[data-edit-title]")) {
      return;
    }
    if (!isSelected) {
      onSelect();
    }
    onToggle();
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          "mb-1 rounded-md border bg-card",
          !isSelected && "hover:bg-secondary/50"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "group flex cursor-pointer items-center gap-2 p-2",
            isSelected && "bg-secondary"
          )}
          onClick={handleHeaderClick}
        >
          {/* Book icon */}
          <BookOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

          {/* Title or Title Input */}
          {editingTitle ? (
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="h-7 flex-1 text-sm"
              autoFocus
            />
          ) : (
            <span className="flex-1 truncate text-sm font-medium">
              {dummy.title}
            </span>
          )}

          {/* Edit title button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onEditTitleToggle();
            }}
            title="Edit title"
            data-edit-title
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {/* Expand/collapse indicator */}
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="space-y-3 border-t p-3">
            {/* Script dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                SCRIPT
              </Label>
              <Select value={selectedScriptId} onValueChange={onScriptChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select a script..." />
                </SelectTrigger>
                <SelectContent>
                  {scriptDocs.map((doc, idx) => (
                    <SelectItem key={idx} value={String(idx)}>
                      {doc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PromptPanel */}
            <PromptPanel
              promptValue={promptValue}
              attachments={attachments}
              isGenerating={isGenerating}
              onPromptChange={onPromptChange}
              onAttachmentsChange={onAttachmentsChange}
              onGenerate={onGenerate}
            />

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onDuplicate}
                disabled={isGenerating}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onDelete}
                disabled={isGenerating}
              >
                <Trash className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
