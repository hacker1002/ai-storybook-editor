// objects-sidebar-popovers.tsx - Popover sub-components + layer divider for objects sidebar
// Extracted from objects-sidebar.tsx to keep that file under the 1000-line modularization threshold.
"use client";

import {
  Eye,
  EyeOff,
  Globe,
  Smile,
  Box,
  Image as ImageIcon,
  Square,
  CircleDot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import type { SpreadItemMediaType } from "@/types/spread-types";

const ASSET_TYPE_CONFIG: Record<
  SpreadItemMediaType,
  { icon: LucideIcon; label: string }
> = {
  raw: { icon: Globe, label: "Raw" },
  character: { icon: Smile, label: "Character" },
  prop: { icon: Box, label: "Prop" },
  background: { icon: ImageIcon, label: "Background" },
  foreground: { icon: Square, label: "Foreground" },
  other: { icon: CircleDot, label: "Other" },
};

/** Filter popover content (asset/media type checkboxes). */
export function FilterPopoverContent({
  assetFilter,
  allAssets,
  allAssetTypes,
  onToggleAsset,
  onToggleAllAssets,
}: {
  assetFilter: Set<SpreadItemMediaType>;
  allAssets: boolean;
  allAssetTypes: SpreadItemMediaType[];
  onToggleAsset: (type: SpreadItemMediaType) => void;
  onToggleAllAssets: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="font-semibold text-base">Filter</p>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">
          By Object Type
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allAssets}
            onChange={onToggleAllAssets}
            className="rounded w-4 h-4 accent-blue-500"
          />
          All Types
        </label>
        {allAssetTypes.map((type) => {
          const config = ASSET_TYPE_CONFIG[type];
          return (
            <label
              key={type}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={allAssets || assetFilter.has(type)}
                onChange={() => onToggleAsset(type)}
                className="rounded w-4 h-4 accent-blue-500"
              />
              <config.icon className="w-4 h-4 text-muted-foreground" />
              {config.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

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
