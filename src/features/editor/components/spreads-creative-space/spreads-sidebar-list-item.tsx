// spreads-sidebar-list-item.tsx - Individual item row in spreads (illustration) sidebar
// Simpler than objects-sidebar-list-item: no visibility toggles, only rename action.
"use client";

import { Pencil, Check, GripVertical } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ELEMENT_TYPE_CONFIG, type ElementListEntry } from "./utils";

interface SpreadsSidebarListItemProps {
  entry: ElementListEntry;
  isSelected: boolean;
  editingId: string | null;
  onSelect: () => void;
  onEditStart: () => void;
  onRenameConfirm: () => void;
  editValue: string;
  onEditValueChange: (v: string) => void;
  dragIndex: number | null;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

export function SpreadsSidebarListItem({
  entry,
  isSelected,
  editingId,
  onSelect,
  onEditStart,
  onRenameConfirm,
  editValue,
  onEditValueChange,
  dragIndex,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SpreadsSidebarListItemProps) {
  const isEditing = editingId === entry.id;
  const isPage = entry.type === "page";
  // Textbox title is auto-derived, page backgrounds are fixed — renaming disabled
  const isRenameable = entry.type !== "raw_textbox" && !isPage;
  const config = ELEMENT_TYPE_CONFIG[entry.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group flex items-center h-12 px-2 gap-1.5 cursor-pointer transition-colors text-sm",
        isSelected ? "bg-accent/80" : "hover:bg-muted/50",
        dragIndex === index && "opacity-40"
      )}
      onClick={onSelect}
      draggable={!isPage}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.dataTransfer.dropEffect = "move";
        onDragOver(e);
      }}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      role="option"
      aria-selected={isSelected}
    >
      {/* Drag handle (hidden for pages) */}
      {!isPage && (
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100" />
      )}

      {/* Type icon */}
      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />

      {/* Name / Inline edit */}
      {isEditing && isRenameable ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameConfirm();
              if (e.key === "Escape") onRenameConfirm();
            }}
            className="flex-1 min-w-0 text-sm px-1 py-0.5 border rounded bg-background"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRenameConfirm();
            }}
            className="p-0.5 rounded hover:bg-muted"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <span className="flex-1 truncate min-w-0">{entry.title}</span>
      )}

      {/* Hover actions */}
      {isRenameable && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditStart();
                }}
                className="p-0.5 rounded hover:bg-muted"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Rename
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
