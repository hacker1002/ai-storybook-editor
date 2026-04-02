// section-sidebar-item.tsx - Section header row in the branch sidebar (collapsible, editable)
"use client";

import React from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Pencil,
  Settings,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/utils/utils";
import { createLogger } from "@/utils/logger";
import type { Section } from "./branch-types";

const log = createLogger("Editor", "SectionSidebarItem");

interface SectionSidebarItemProps {
  section: Section;
  spreadCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onEditClick: () => void;
  onGearClick: () => void;
}

function SectionSidebarItemInner({
  section,
  spreadCount,
  isExpanded,
  onToggle,
  onEditClick,
  onGearClick,
}: SectionSidebarItemProps) {
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug("handleToggle", "toggle section", { sectionId: section.id, isExpanded });
    onToggle();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug("handleEditClick", "edit section", { sectionId: section.id });
    onEditClick();
  };

  const handleGearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.debug("handleGearClick", "section gear clicked", { sectionId: section.id });
    onGearClick();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => e.key === "Enter" && onToggle()}
      className={cn(
        "group flex items-center gap-1.5 h-9 pl-3 pr-2 cursor-pointer rounded-sm transition-colors select-none",
        "hover:bg-muted"
      )}
    >
      {/* Chevron toggle */}
      <button
        type="button"
        className="p-0 shrink-0"
        onClick={handleToggle}
        aria-label={isExpanded ? "Collapse section" : "Expand section"}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      <FolderOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

      <span className="flex-1 text-sm truncate font-medium">
        {section.title}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">
        ({spreadCount})
      </span>

      {/* Redirect indicator — always visible when next_spread_id is set */}
      {section.next_spread_id && (
        <ArrowRight className="w-3.5 h-3.5 text-orange-400 shrink-0" aria-label="Has redirect" />
      )}

      {/* Action icons — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="p-0.5 rounded hover:bg-background/80"
          onClick={handleEditClick}
          aria-label="Edit section"
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-background/80"
          onClick={handleGearClick}
          aria-label="Section settings"
        >
          <Settings className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export const SectionSidebarItem = React.memo(SectionSidebarItemInner);
