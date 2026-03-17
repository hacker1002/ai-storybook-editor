// objects-sidebar-list-item.tsx - Individual item row in objects sidebar
"use client";

import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Pencil,
  Check,
  GripVertical,
  Image,
  Type,
  Hexagon,
  Video,
  Volume2,
  CircleHelp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/utils";
import type { ObjectElementType } from "./objects-creative-space";
import type { SpreadItemMediaType } from "@/types/spread-types";

export interface ObjectListEntry {
  id: string;
  type: ObjectElementType;
  title: string;
  zIndex: number;
  editorVisible: boolean;
  locked: boolean;
  assetType?: SpreadItemMediaType;
}

export const ELEMENT_TYPE_CONFIG: Record<
  ObjectElementType,
  { icon: LucideIcon; label: string }
> = {
  image: { icon: Image, label: "Image" },
  text: { icon: Type, label: "Text" },
  shape: { icon: Hexagon, label: "Shape" },
  video: { icon: Video, label: "Video" },
  audio: { icon: Volume2, label: "Audio" },
  quiz: { icon: CircleHelp, label: "Quiz" },
};

interface ObjectListItemProps {
  entry: ObjectListEntry;
  isSelected: boolean;
  editingId: string | null;
  onSelect: () => void;
  onVisibilityToggle: () => void;
  onLockToggle: () => void;
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

export function ObjectListItem({
  entry,
  isSelected,
  editingId,
  onSelect,
  onVisibilityToggle,
  onLockToggle,
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
}: ObjectListItemProps) {
  const isEditing = editingId === entry.id;
  const config = ELEMENT_TYPE_CONFIG[entry.type];
  const Icon = config.icon;
  // All types are now draggable within their layer (z-index layer restriction is in sidebar)
  const canDrag = !entry.locked;

  return (
    <div
      className={cn(
        "group flex items-center h-12 px-2 gap-1.5 cursor-pointer transition-colors text-sm",
        isSelected
          ? "bg-blue-50 dark:bg-blue-950 border-l-2 border-blue-500"
          : "hover:bg-muted/50",
        !entry.editorVisible && "opacity-50",
        dragIndex === index && "opacity-40"
      )}
      onClick={onSelect}
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return;
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
      {/* Drag handle (visible on hover for draggable items) */}
      <GripVertical
        className={cn(
          "w-3.5 h-3.5 text-muted-foreground flex-shrink-0",
          canDrag ? "opacity-0 group-hover:opacity-100" : "opacity-0"
        )}
      />

      {/* Type icon */}
      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />

      {/* Name / Edit */}
      {isEditing ? (
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
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onVisibilityToggle();
          }}
          className="p-0.5 rounded hover:bg-muted"
          aria-label="Toggle visibility"
        >
          {entry.editorVisible ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLockToggle();
          }}
          className="p-0.5 rounded hover:bg-muted"
          aria-label="Toggle lock"
        >
          {entry.locked ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <Unlock className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditStart();
          }}
          className="p-0.5 rounded hover:bg-muted"
          aria-label="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
