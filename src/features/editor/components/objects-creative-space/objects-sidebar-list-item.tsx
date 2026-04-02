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
  ImageOff,
  TypeOutline,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { ObjectElementType } from "./objects-creative-space";
import type { SpreadItemMediaType } from "@/types/spread-types";

export interface ObjectListEntry {
  id: string;
  type: ObjectElementType;
  title: string;
  zIndex: number;
  editorVisible: boolean;
  playerVisible: boolean;
  assetType?: SpreadItemMediaType;
}

export const ELEMENT_TYPE_CONFIG: Record<
  ObjectElementType,
  { icon: LucideIcon; label: string }
> = {
  image: { icon: Image, label: "Image" },
  textbox: { icon: Type, label: "Text" },
  shape: { icon: Hexagon, label: "Shape" },
  video: { icon: Video, label: "Video" },
  audio: { icon: Volume2, label: "Audio" },
  raw_image: { icon: ImageOff, label: "Raw Image" },
  raw_textbox: { icon: TypeOutline, label: "Raw Text" },
};

interface ObjectListItemProps {
  entry: ObjectListEntry;
  isSelected: boolean;
  editingId: string | null;
  onSelect: () => void;
  onVisibilityToggle: () => void;
  onPlayerVisibilityToggle: () => void;
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
  onPlayerVisibilityToggle,
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
  const isRaw = entry.type === "raw_image" || entry.type === "raw_textbox";
  const isRenameable = entry.type !== "textbox" && !isRaw;
  const isDraggable = !isRaw;
  const config = ELEMENT_TYPE_CONFIG[entry.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group flex items-center h-12 px-2 gap-1.5 cursor-pointer transition-colors text-sm",
        isSelected ? "bg-accent/80" : "hover:bg-muted/50",
        !entry.editorVisible && "opacity-50",
        dragIndex === index && "opacity-40"
      )}
      onClick={onSelect}
      draggable={isDraggable}
      onDragStart={
        isDraggable
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragStart(index);
            }
          : undefined
      }
      onDragOver={
        isDraggable
          ? (e) => {
              e.dataTransfer.dropEffect = "move";
              onDragOver(e);
            }
          : undefined
      }
      onDrop={isDraggable ? () => onDrop(index) : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      role="option"
      aria-selected={isSelected}
    >
      {/* Drag handle (hidden for raw items) */}
      {isDraggable ? (
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100" />
      ) : (
        <div className="w-3.5 flex-shrink-0" />
      )}

      {/* Type icon */}
      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />

      {/* Name / Edit (rename disabled for textbox) */}
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

      {/* Hover actions with tooltips (hidden for raw items) */}
      {!isRaw && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onVisibilityToggle();
                }}
                className="p-0.5 rounded hover:bg-muted"
              >
                {entry.editorVisible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {entry.editorVisible ? "Hide in editor" : "Show in editor"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayerVisibilityToggle();
                }}
                className="p-0.5 rounded hover:bg-muted"
              >
                {entry.playerVisible ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {entry.playerVisible ? "Hide in player" : "Show in player"}
            </TooltipContent>
          </Tooltip>

          {isRenameable && (
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
          )}
        </div>
      )}
    </div>
  );
}
