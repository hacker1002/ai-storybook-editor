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

export interface GeometryReplaceInput {
  /** Current item geometry in canvas percentage (0-100) */
  old: Geometry;
  /** Replacement media natural pixel dimensions */
  naturalW: number;
  naturalH: number;
  /** Canvas pixel dimensions from store */
  canvasW: number;
  canvasH: number;
}

/**
 * Recompute geometry when user replaces media on an existing canvas item.
 *
 * Strategy: preserve visual area (w*h in %-space) and re-center around the
 * current center. The new media's aspect ratio replaces the old one, but the
 * object's overall "visual weight" stays stable — what the user carefully
 * sized does not get blown away by an upload.
 *
 * Canvas aspect correction: 1% horizontal != 1% vertical in pixel size, so
 * pixel aspect must be divided by canvas aspect to get percent-space aspect.
 *
 * Overflow fallback: if preserving area produces a side > 100%, the longer
 * side is clamped to 100% and the other follows percentAspect.
 */
export function computeGeometryOnMediaReplace({
  old,
  naturalW,
  naturalH,
  canvasW,
  canvasH,
}: GeometryReplaceInput): Geometry {
  if (naturalW <= 0 || naturalH <= 0 || canvasW <= 0 || canvasH <= 0) {
    return old;
  }

  const pixelAspect = naturalW / naturalH;
  const canvasAspect = canvasW / canvasH;
  const percentAspect = pixelAspect / canvasAspect;

  const area = Math.max(1, old.w * old.h);
  let newW = Math.sqrt(area * percentAspect);
  let newH = Math.sqrt(area / percentAspect);

  const MAX = 100;
  if (newW > MAX || newH > MAX) {
    if (newW >= newH) {
      newW = MAX;
      newH = MAX / percentAspect;
    } else {
      newH = MAX;
      newW = MAX * percentAspect;
    }
  }

  newW = clampGeometry("w", newW);
  newH = clampGeometry("h", newH);

  const centerX = old.x + old.w / 2;
  const centerY = old.y + old.h / 2;
  let newX = centerX - newW / 2;
  let newY = centerY - newH / 2;
  newX = Math.max(0, Math.min(newX, 100 - newW));
  newY = Math.max(0, Math.min(newY, 100 - newH));

  return { x: newX, y: newY, w: newW, h: newH };
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

/** Read-only geometry display — shows x, y, w, h as non-editable text */
export function ReadOnlyGeometrySection({ geometry }: { geometry: Geometry }) {
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
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <span className="px-2 text-sm text-muted-foreground border-r border-border">X</span>
            <span className="w-12 px-1 text-sm text-center text-muted-foreground">{Math.round(geometry.x)}</span>
            <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
          </div>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <span className="px-2 text-sm text-muted-foreground border-r border-border">Y</span>
            <span className="w-12 px-1 text-sm text-center text-muted-foreground">{Math.round(geometry.y)}</span>
            <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Size</Label>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <span className="px-2 text-sm text-muted-foreground border-r border-border">W</span>
            <span className="w-12 px-1 text-sm text-center text-muted-foreground">{Math.round(geometry.w)}</span>
            <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
          </div>
          <div className="flex items-center border border-border rounded-lg bg-secondary overflow-hidden h-7">
            <span className="px-2 text-sm text-muted-foreground border-r border-border">H</span>
            <span className="w-12 px-1 text-sm text-center text-muted-foreground">{Math.round(geometry.h)}</span>
            <span className="px-1.5 text-sm text-muted-foreground border-l border-border">%</span>
          </div>
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
