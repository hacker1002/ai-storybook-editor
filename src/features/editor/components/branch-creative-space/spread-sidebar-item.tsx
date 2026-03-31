// spread-sidebar-item.tsx - Single spread row in the branch sidebar
"use client";

import React from "react";
import { Settings, GitBranch, ArrowRight } from "lucide-react";
import { cn } from "@/utils/utils";
import { useSpreadNavigation } from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import type { BaseSpread } from "./branch-types";

const log = createLogger("Editor", "SpreadSidebarItem");

interface SpreadSidebarItemProps {
  spread: BaseSpread;
  isSelected: boolean;
  isChild: boolean;
  onClick: () => void;
  onGearClick: () => void;
}

function SpreadSidebarItemInner({
  spread,
  isSelected,
  isChild,
  onClick,
  onGearClick,
}: SpreadSidebarItemProps) {
  const nav = useSpreadNavigation(spread.id);
  const hasBranching = !!nav?.branch_setting;
  const nextId = nav?.next_spread_id;

  // Derive page label from spread pages
  const pageNumbers =
    spread.pages.length > 0
      ? spread.pages.map((p) => p.number).join("-")
      : spread.id.slice(0, 6);
  const pageLabel = `Page ${pageNumbers}`;

  const handleGearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug("handleGearClick", "gear clicked", { spreadId: spread.id });
    onGearClick();
  };

  const handleClick = () => {
    log.info("handleClick", "spread selected", { spreadId: spread.id });
    onClick();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className={cn(
        "group flex items-center gap-2 h-9 pr-2 cursor-pointer rounded-sm transition-colors select-none",
        "hover:bg-muted",
        isChild ? "pl-7" : "pl-3",
        isSelected && "bg-accent"
      )}
    >
      {/* Page label */}
      <span className="flex-1 text-sm truncate text-foreground">
        {pageLabel}
      </span>

      {/* Indicators */}
      <div className="flex items-center gap-1 text-muted-foreground">
        {hasBranching && (
          <GitBranch
            className="w-3.5 h-3.5 text-blue-500"
            aria-label="Has branching"
          />
        )}
        {nextId && (
          <ArrowRight
            className="w-3.5 h-3.5 text-orange-400"
            aria-label="Has redirect"
          />
        )}
      </div>

      {/* Gear icon — visible on hover */}
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background/80 transition-opacity"
        onClick={handleGearClick}
        aria-label="Spread settings"
      >
        <Settings className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export const SpreadSidebarItem = React.memo(SpreadSidebarItemInner);
