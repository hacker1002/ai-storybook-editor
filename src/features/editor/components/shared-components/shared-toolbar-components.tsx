// shared-toolbar-components.tsx - Reusable toolbar sub-components for objects creative space toolbars

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { Geometry } from "@/types/canvas-types";
import type { SpreadItemMediaType } from "@/types/spread-types";

// === Constants ===

export const MEDIA_TYPE_OPTIONS: { label: string; value: SpreadItemMediaType }[] = [
  { label: "Character", value: "character" },
  { label: "Prop", value: "prop" },
  { label: "Background", value: "background" },
  { label: "Foreground", value: "foreground" },
  { label: "Raw", value: "raw" },
  { label: "Other", value: "other" },
];

export const DEFAULT_STATES = [
  "default",
  "happy",
  "sad",
  "angry",
  "running",
  "sleeping",
  "front",
  "back",
  "side",
];

// === Helpers ===

export function clampGeometry(field: keyof Geometry, value: number): number {
  const min = field === "w" || field === "h" ? 1 : 0;
  return Math.max(min, Math.min(100, value));
}

// === Sub-components ===

export function GeometryInput({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
      <span className="px-2 text-sm text-muted-foreground border-r border-border">
        {label}
      </span>
      <input
        type="text"
        role="spinbutton"
        aria-label={ariaLabel}
        value={Math.round(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 bg-transparent px-1 text-sm text-center focus:outline-none"
      />
      <span className="px-1.5 text-sm text-muted-foreground border-l border-border">
        %
      </span>
    </div>
  );
}

export function GeometrySection({
  geometry,
  onGeometryChange,
}: {
  geometry: Geometry;
  onGeometryChange: (field: keyof Geometry, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase">
        Geometry
      </Label>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">
            Position
          </Label>
          <GeometryInput
            label="X"
            value={geometry.x}
            onChange={(v) => onGeometryChange("x", v)}
            ariaLabel="Position X"
          />
          <GeometryInput
            label="Y"
            value={geometry.y}
            onChange={(v) => onGeometryChange("y", v)}
            ariaLabel="Position Y"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Size</Label>
          <GeometryInput
            label="W"
            value={geometry.w}
            onChange={(v) => onGeometryChange("w", v)}
            ariaLabel="Size W"
          />
          <GeometryInput
            label="H"
            value={geometry.h}
            onChange={(v) => onGeometryChange("h", v)}
            ariaLabel="Size H"
          />
        </div>
      </div>
    </div>
  );
}

export function MediaIdentitySection({
  type,
  name,
  state,
  onTypeChange,
  onNameChange,
  onStateChange,
  mediaLabel = "Image",
}: {
  type: SpreadItemMediaType;
  name: string;
  state: string;
  onTypeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onStateChange: (value: string) => void;
  mediaLabel?: string;
}) {
  const isEntityType = type === "character" || type === "prop";
  const showNameState = type !== "raw" && type !== "other";

  return (
    <>
      {/* Row 1: Type */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-14 shrink-0">
          Type
        </Label>
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger
            className="h-7 text-sm flex-1"
            aria-label={`${mediaLabel} type`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEDIA_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Name + State (hidden for raw/other types) */}
      {showNameState && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14 shrink-0">
            Name
          </Label>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* TODO: Replace with entity dropdown (useCharacters/useProps) when store selectors are available */}
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={
                isEntityType ? `${type} name...` : "Enter name..."
              }
              aria-label={`${mediaLabel} name`}
              className="h-7 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Select value={state} onValueChange={onStateChange}>
              <SelectTrigger
                className="h-7 text-sm w-24 shrink-0"
                aria-label={`${mediaLabel} state`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </>
  );
}

export function ToolbarIconButton({
  icon: Icon,
  label,
  onClick,
  variant,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  variant?: "destructive";
  disabled?: boolean;
}) {
  const isDestructive = variant === "destructive";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={
            isDestructive
              ? "p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
              : "p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
          }
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
