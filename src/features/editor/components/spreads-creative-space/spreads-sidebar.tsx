// spreads-sidebar.tsx - Left sidebar listing all elements in a selected illustration spread
// Simpler than objects-sidebar: only element type filter (no asset type), 3 element types.
// Drag reorder works by replacing the raw array in the spread (no z-index arithmetic).
"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Filter } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { useSnapshotStore } from "@/stores/snapshot-store";
import { createLogger } from "@/utils/logger";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { SpreadsSidebarListItem } from "./spreads-sidebar-list-item";
import {
  buildElementList,
  filterElementList,
  groupEntriesByLayer,
  ALL_ELEMENT_TYPES,
  ELEMENT_TYPE_CONFIG,
  NEW_ELEMENT_DEFAULTS,
  createDefaultTextbox,
  type SpreadElementType,
  type ElementListEntry,
  type LayerGroup,
} from "./utils";
import type { SpreadImage, SpreadShape } from "@/types/canvas-types";

const log = createLogger("Editor", "SpreadsSidebar");

// === Props ===

interface SpreadsSidebarProps {
  selectedSpreadId: string;
  selectedItemId: { type: string; id: string } | null;
  onItemSelect: (item: { type: string; id: string } | null) => void;
}

// === Inline sub-components ===

/** Filter popover: element type only (no asset type for illustration spreads) */
function FilterPopoverContent({
  elementFilter,
  allElements,
  onToggleElement,
  onToggleAllElements,
}: {
  elementFilter: Set<SpreadElementType>;
  allElements: boolean;
  onToggleElement: (type: SpreadElementType) => void;
  onToggleAllElements: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="font-semibold text-base">Filter</p>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">
          By Element Type
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allElements}
            onChange={onToggleAllElements}
            className="rounded w-4 h-4 accent-blue-500"
          />
          All Elements
        </label>
        {ALL_ELEMENT_TYPES.map((type) => {
          const config = ELEMENT_TYPE_CONFIG[type];
          return (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allElements || elementFilter.has(type)}
                onChange={() => onToggleElement(type)}
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

/** Add element popover: image, textbox, shape */
function AddElementPopoverContent({
  onAdd,
}: {
  onAdd: (type: SpreadElementType) => void;
}) {
  return (
    <div className="py-1">
      {ALL_ELEMENT_TYPES.map((type) => {
        const config = ELEMENT_TYPE_CONFIG[type];
        return (
          <button
            key={type}
            type="button"
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors rounded-sm"
            onClick={() => onAdd(type)}
          >
            <config.icon className="w-4 h-4 text-muted-foreground" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// === Main Component ===

export function SpreadsSidebar({
  selectedSpreadId,
  selectedItemId,
  onItemSelect,
}: SpreadsSidebarProps) {
  // Defensive: guard against illustration being undefined during store init
  const spread = useSnapshotStore(
    (s) => s.illustration?.spreads?.find((sp) => sp.id === selectedSpreadId)
  );
  const actions = useSnapshotActions();
  const langCode = useLanguageCode();

  // Local UI state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Filter state (all checked by default)
  const [elementFilter, setElementFilter] = useState<Set<SpreadElementType>>(
    new Set(ALL_ELEMENT_TYPES)
  );
  const [allElements, setAllElements] = useState(true);

  // Drag state
  const [dragLayerLabel, setDragLayerLabel] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Build + filter element list
  const allEntries = useMemo(() => {
    if (!spread) return [];
    return buildElementList(spread, langCode);
  }, [spread, langCode]);

  const filteredEntries = useMemo(
    () => filterElementList(allEntries, elementFilter, allElements),
    [allEntries, elementFilter, allElements]
  );

  const layerGroups = useMemo(
    () => groupEntriesByLayer(filteredEntries),
    [filteredEntries]
  );

  const isFilterActive = !allElements;

  // === Handlers ===

  const handleItemClick = useCallback(
    (entry: ElementListEntry) => {
      onItemSelect({ type: entry.type, id: entry.id });
    },
    [onItemSelect]
  );

  const handleEditStart = useCallback((entry: ElementListEntry) => {
    // Textbox title is auto-derived — renaming not supported
    if (entry.type === "textbox") return;
    setEditingItemId(entry.id);
    setEditValue(entry.title);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (!editingItemId || !editValue.trim()) {
      setEditingItemId(null);
      return;
    }
    const entry = allEntries.find((e) => e.id === editingItemId);
    if (!entry) {
      setEditingItemId(null);
      return;
    }

    log.debug("handleRenameConfirm", "renaming", {
      id: entry.id,
      type: entry.type,
      title: editValue,
    });

    const titleUpdate = { title: editValue.trim() };
    if (entry.type === "image") {
      actions.updateIllustrationImage(
        selectedSpreadId,
        entry.id,
        titleUpdate as Partial<SpreadImage>
      );
    } else if (entry.type === "shape") {
      actions.updateIllustrationShape(
        selectedSpreadId,
        entry.id,
        titleUpdate as Partial<SpreadShape>
      );
    }

    setEditingItemId(null);
  }, [editingItemId, editValue, allEntries, actions, selectedSpreadId]);

  // === Drag and drop handlers ===

  const handleDragStart = useCallback((index: number, layerLabel: string) => {
    setDragIndex(index);
    setDragLayerLabel(layerLabel);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  /**
   * Reorder by replacing the spread's raw array for the element type.
   * All entries within a layer share the same type (image/shape/textbox),
   * so we splice the spread's source array directly and call updateIllustrationSpread.
   */
  const handleLayerDrop = useCallback(
    (targetIndex: number, group: LayerGroup) => {
      if (
        dragIndex === null ||
        dragIndex === targetIndex ||
        dragLayerLabel !== group.layer.label
      ) {
        setDragIndex(null);
        setDragLayerLabel(null);
        return;
      }

      if (!spread) return;

      log.info("handleLayerDrop", "reordering within layer", {
        layer: group.layer.label,
        from: dragIndex,
        to: targetIndex,
      });

      // Map visual group indices back to source-array positions via entry IDs,
      // because group entries are z-index-sorted while raw arrays are insertion-ordered.
      const draggedEntry = group.entries[dragIndex];
      const targetEntry = group.entries[targetIndex];
      if (!draggedEntry || !targetEntry) return;

      const entryType = draggedEntry.type;

      if (entryType === "image") {
        const arr = [...spread.images];
        const fromIdx = arr.findIndex((i) => i.id === draggedEntry.id);
        const toIdx = arr.findIndex((i) => i.id === targetEntry.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        actions.updateIllustrationSpread(selectedSpreadId, { images: arr });
      } else if (entryType === "shape") {
        const arr = [...(spread.shapes ?? [])];
        const fromIdx = arr.findIndex((s) => s.id === draggedEntry.id);
        const toIdx = arr.findIndex((s) => s.id === targetEntry.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        actions.updateIllustrationSpread(selectedSpreadId, { shapes: arr });
      } else if (entryType === "textbox") {
        const arr = [...spread.textboxes];
        const fromIdx = arr.findIndex((t) => t.id === draggedEntry.id);
        const toIdx = arr.findIndex((t) => t.id === targetEntry.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        actions.updateIllustrationSpread(selectedSpreadId, {
          textboxes: arr,
        });
      }

      setDragIndex(null);
      setDragLayerLabel(null);
    },
    [dragIndex, dragLayerLabel, spread, actions, selectedSpreadId]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragLayerLabel(null);
  }, []);

  const handleAddElement = useCallback(
    (type: SpreadElementType) => {
      log.info("handleAddElement", "adding", { type });

      if (type === "image") {
        const newId = crypto.randomUUID();
        actions.addIllustrationImage(selectedSpreadId, {
          id: newId,
          ...NEW_ELEMENT_DEFAULTS.image,
        } as SpreadImage);
        onItemSelect({ type, id: newId });
      } else if (type === "shape") {
        const newId = crypto.randomUUID();
        actions.addIllustrationShape(selectedSpreadId, {
          id: newId,
          ...NEW_ELEMENT_DEFAULTS.shape,
        } as SpreadShape);
        onItemSelect({ type, id: newId });
      } else if (type === "textbox") {
        const defaults = createDefaultTextbox(langCode);
        const newId = defaults.id;
        actions.addIllustrationTextbox(selectedSpreadId, defaults);
        onItemSelect({ type, id: newId });
      }

      setIsAddOpen(false);
    },
    [actions, selectedSpreadId, langCode, onItemSelect]
  );

  // Filter toggles
  const handleToggleElement = useCallback((type: SpreadElementType) => {
    setAllElements(false);
    setElementFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (next.size === ALL_ELEMENT_TYPES.length) setAllElements(true);
      return next;
    });
  }, []);

  const handleToggleAllElements = useCallback(() => {
    setAllElements((prev) => {
      if (!prev) setElementFilter(new Set(ALL_ELEMENT_TYPES));
      else setElementFilter(new Set());
      return !prev;
    });
  }, []);

  if (!spread) return null;

  return (
    <nav
      className="w-[280px] flex flex-col h-full border-r bg-background"
      role="listbox"
      aria-label="Elements list"
    >
      {/* Header with Filter & Add popovers */}
      <div className="flex items-center h-14 px-3 border-b gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "p-1 rounded hover:bg-muted transition-colors",
                isFilterActive && "text-blue-500"
              )}
              aria-label="Toggle filter"
            >
              <Filter className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-56">
            <FilterPopoverContent
              elementFilter={elementFilter}
              allElements={allElements}
              onToggleElement={handleToggleElement}
              onToggleAllElements={handleToggleAllElements}
            />
          </PopoverContent>
        </Popover>

        <span className="flex-1 font-semibold text-sm">Elements</span>

        <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label="Add element"
            >
              <Plus className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-48 p-1">
            <AddElementPopoverContent onAdd={handleAddElement} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Body */}
      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {allEntries.length === 0 ? "No elements" : "No matching elements"}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {layerGroups.map((group) => (
            <div key={group.layer.label}>
              {/* Layer divider — no visibility toggle for illustration elements */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-y border-border/50 select-none">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.layer.label}
                </span>
              </div>

              {/* Items */}
              {group.entries.map((entry, index) => (
                <SpreadsSidebarListItem
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isSelected={selectedItemId?.id === entry.id}
                  editingId={editingItemId}
                  editValue={editValue}
                  onEditValueChange={setEditValue}
                  onSelect={() => handleItemClick(entry)}
                  onEditStart={() => handleEditStart(entry)}
                  onRenameConfirm={handleRenameConfirm}
                  dragIndex={
                    dragLayerLabel === group.layer.label ? dragIndex : null
                  }
                  onDragStart={(idx) => handleDragStart(idx, group.layer.label)}
                  onDragOver={handleDragOver}
                  onDrop={(idx) => handleLayerDrop(idx, group)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}

export default SpreadsSidebar;
