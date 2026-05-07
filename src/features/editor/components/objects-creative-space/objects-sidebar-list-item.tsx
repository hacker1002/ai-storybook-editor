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
  Music,
  ImageOff,
  TypeOutline,
  ImagePlay,
  Layers,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { ObjectElementType } from "./objects-creative-space";
import type { EditionTag, SpreadItemMediaType } from "@/types/spread-types";
import { EDITION_LABEL } from "./utils/composite-list-helpers";

export interface ObjectListEntry {
  id: string;
  type: ObjectElementType;
  title: string;
  zIndex: number;
  editorVisible: boolean;
  playerVisible: boolean;
  assetType?: SpreadItemMediaType;
  /** Parent composite id when this entry is a variant child (image/auto_pic). */
  parentCompositeId?: string;
  /** Edition slots this variant occupies (only when parentCompositeId is set). */
  variantEditions?: EditionTag[];
  /** True for composite group rows themselves. */
  isComposite?: boolean;
  /** Variant children attached to a composite group (populated post group-by-layer). */
  children?: ObjectListEntry[];
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
  auto_audio: { icon: Music, label: "Auto Audio" },
  auto_pic: { icon: ImagePlay, label: "Auto Pic" },
  composite: { icon: Layers, label: "Composite" },
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
  /** Composite-aware extras (optional) */
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onRemoveFromComposite?: () => void;
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
  isExpanded,
  onToggleExpand,
  onRemoveFromComposite,
}: ObjectListItemProps) {
  const isEditing = editingId === entry.id;
  const isRaw = entry.type === "raw_image" || entry.type === "raw_textbox";
  const isComposite = entry.isComposite === true;
  const isCompositeChild = entry.parentCompositeId !== undefined;
  const isRenameable =
    entry.type !== "textbox" && !isRaw && !isCompositeChild;
  const isDraggable = !isRaw && !isCompositeChild;
  const config = ELEMENT_TYPE_CONFIG[entry.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group flex items-center h-12 px-2 gap-1.5 cursor-pointer transition-colors text-sm",
        isSelected ? "bg-accent/80" : "hover:bg-muted/50",
        !entry.editorVisible && "opacity-50",
        dragIndex === index && "opacity-40",
        isCompositeChild && "pl-6"
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
      {/* Drag handle / indent spacer */}
      {isDraggable ? (
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100" />
      ) : (
        <div className="w-3.5 flex-shrink-0" />
      )}

      {/* Composite expand/collapse caret (composite group row only) */}
      {isComposite && onToggleExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="p-0.5 rounded hover:bg-muted flex-shrink-0"
          aria-label={isExpanded ? "Collapse composite" : "Expand composite"}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Type icon */}
      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />

      {/* Name / Edit */}
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

      {/* Edition tag chips (composite child only) */}
      {isCompositeChild && entry.variantEditions && entry.variantEditions.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {entry.variantEditions.map((ed) => (
            <span
              key={ed}
              className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground uppercase tracking-wider"
            >
              {EDITION_LABEL[ed]}
            </span>
          ))}
        </div>
      )}

      {/* Hover actions */}
      {isCompositeChild ? (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
          {onRemoveFromComposite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromComposite();
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Remove from composite
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
          {/* Editor visibility */}
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

          {/* Player visibility (skip for raw items) */}
          {!isRaw && (
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
          )}

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
