// objects-sidebar-popovers.tsx - Popover sub-components + layer divider for objects sidebar
// Extracted from objects-sidebar.tsx to keep that file under the 1000-line modularization threshold.
"use client";

import {
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ELEMENT_TYPE_CONFIG,
} from "./objects-sidebar-list-item";
import type { ObjectElementType } from "./objects-creative-space";

/** Add element popover content. Composite entry is disabled when fewer than 2
 *  free image/auto_pic candidates exist (cannot form a composite). */
export function AddElementPopoverContent({
  onAdd,
  compositeCandidateCount,
  addElementTypes,
}: {
  onAdd: (type: ObjectElementType) => void;
  compositeCandidateCount: number;
  addElementTypes: ObjectElementType[];
}) {
  return (
    <div className="py-1">
      {addElementTypes.map((type) => {
        const config = ELEMENT_TYPE_CONFIG[type];
        const isComposite = type === "composite";
        const disabled = isComposite && compositeCandidateCount < 2;
        const button = (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-sm transition-colors",
              disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"
            )}
            onClick={() => {
              if (!disabled) onAdd(type);
            }}
          >
            <config.icon className="w-4 h-4 text-muted-foreground" />
            {config.label}
          </button>
        );
        if (disabled) {
          return (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <span className="block">{button}</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Need at least 2 free images/animated pics
              </TooltipContent>
            </Tooltip>
          );
        }
        return <div key={type}>{button}</div>;
      })}
    </div>
  );
}

/** Visual divider between layer groups (with hide-all toggle). */
export function LayerDivider({
  label,
  allVisible,
  onToggleVisibility,
}: {
  label: string;
  allVisible: boolean;
  onToggleVisibility: () => void;
}) {
  const Icon = allVisible ? Eye : EyeOff;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-y border-border/50 select-none">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
        {label}
      </span>
      <button
        type="button"
        onClick={onToggleVisibility}
        className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
        aria-label={
          allVisible ? `Hide all in ${label}` : `Show all in ${label}`
        }
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
