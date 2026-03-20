// shared-toolbar-components.tsx - Reusable toolbar sub-components for objects creative space toolbars

import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { Geometry } from "@/types/canvas-types";

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
