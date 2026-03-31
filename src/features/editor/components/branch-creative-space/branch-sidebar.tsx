// branch-sidebar.tsx - Left sidebar for BranchCreativeSpace: sections + spreads tree
"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLogger } from "@/utils/logger";
import { useIllustrationSpreads, useSections } from "@/stores/snapshot-store/selectors";
import { buildSidebarList } from "./branch-utils";
import { AddSectionInput } from "./add-section-input";
import { SpreadSidebarItem } from "./spread-sidebar-item";
import { SectionSidebarItem } from "./section-sidebar-item";

const log = createLogger("Editor", "BranchSidebar");

interface BranchSidebarProps {
  selectedSpreadId: string | null;
  isAddMode: boolean;
  addSectionTitle: string;
  isAddConfirmDisabled: boolean;
  expandedSectionIds: Set<string>;
  onSpreadSelect: (id: string) => void;
  onSpreadGearClick: (id: string) => void;
  onSectionGearClick: (id: string) => void;
  onStartAddMode: () => void;
  onCancelAddMode: () => void;
  onConfirmAddSection: () => void;
  onAddSectionTitleChange: (v: string) => void;
  onToggleSection: (id: string) => void;
  onEditSectionClick: (id: string) => void;
}

export function BranchSidebar({
  selectedSpreadId,
  isAddMode,
  addSectionTitle,
  isAddConfirmDisabled,
  expandedSectionIds,
  onSpreadSelect,
  onSpreadGearClick,
  onSectionGearClick,
  onStartAddMode,
  onCancelAddMode,
  onConfirmAddSection,
  onAddSectionTitleChange,
  onToggleSection,
  onEditSectionClick,
}: BranchSidebarProps) {
  const spreads = useIllustrationSpreads();
  const sections = useSections();

  const sidebarItems = useMemo(() => {
    log.debug("sidebarItems", "rebuilding sidebar list", {
      spreadCount: spreads.length,
      sectionCount: sections.length,
      expandedCount: expandedSectionIds.size,
    });
    return buildSidebarList(spreads, sections, expandedSectionIds);
  }, [spreads, sections, expandedSectionIds]);

  const handleStartAddMode = () => {
    log.info("handleStartAddMode", "entering add section mode");
    onStartAddMode();
  };

  return (
    <nav
      className="w-[280px] flex flex-col h-full border-r bg-background"
      aria-label="Branch sections"
    >
      {/* Header */}
      <div className="flex items-center h-14 px-3 border-b gap-2 shrink-0">
        <span className="flex-1 font-semibold text-sm">Sections</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleStartAddMode}
          disabled={isAddMode}
          aria-label="Add section"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Add section input (conditional) */}
      {isAddMode && (
        <AddSectionInput
          value={addSectionTitle}
          onChange={onAddSectionTitleChange}
          onConfirm={onConfirmAddSection}
          onCancel={onCancelAddMode}
          isConfirmDisabled={isAddConfirmDisabled}
        />
      )}

      {/* Sidebar body */}
      <div className="flex-1 overflow-y-auto py-1">
        {sidebarItems.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-sm text-muted-foreground">
            No spreads
          </div>
        ) : (
          sidebarItems.map((item) => {
            if (item.type === "spread") {
              return (
                <SpreadSidebarItem
                  key={item.spread.id}
                  spread={item.spread}
                  isSelected={selectedSpreadId === item.spread.id}
                  isChild={item.isChild}
                  onClick={() => {
                    log.debug("onSpreadSelect", "spread clicked", { spreadId: item.spread.id });
                    onSpreadSelect(item.spread.id);
                  }}
                  onGearClick={() => onSpreadGearClick(item.spread.id)}
                />
              );
            }

            return (
              <SectionSidebarItem
                key={item.section.id}
                section={item.section}
                spreadCount={item.spreadCount}
                isExpanded={expandedSectionIds.has(item.section.id)}
                onToggle={() => onToggleSection(item.section.id)}
                onEditClick={() => onEditSectionClick(item.section.id)}
                onGearClick={() => onSectionGearClick(item.section.id)}
              />
            );
          })
        )}
      </div>
    </nav>
  );
}
