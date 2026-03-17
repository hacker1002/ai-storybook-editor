// objects-sidebar.tsx - Left sidebar listing all objects in selected spread
"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Filter } from "lucide-react";
import { cn } from "@/utils/utils";
import {
  useRetouchSpreadById,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import {
  ObjectListItem,
  ELEMENT_TYPE_CONFIG,
  type ObjectListEntry,
} from "./objects-sidebar-list-item";
import { buildObjectList, filterObjectList } from "./utils";
import type { SelectedItem, ObjectElementType } from "./objects-creative-space";
import type {
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
} from "@/types/canvas-types";
import type { SpreadItemMediaType } from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsSidebar");

const ALL_ELEMENT_TYPES: ObjectElementType[] = [
  "image",
  "text",
  "shape",
  "video",
  "audio",
  "quiz",
];
const ALL_ASSET_TYPES: SpreadItemMediaType[] = [
  "raw",
  "character",
  "prop",
  "background",
  "foreground",
  "other",
];

// === Props ===

interface ObjectsSidebarProps {
  selectedSpreadId: string;
  selectedItemId: SelectedItem | null;
  onItemSelect: (item: SelectedItem | null) => void;
}

// === Inline sub-components ===

function SidebarHeader({
  onFilterClick,
  onAddClick,
  isFilterActive,
}: {
  onFilterClick: () => void;
  onAddClick: () => void;
  isFilterActive: boolean;
}) {
  return (
    <div className="flex items-center h-14 px-3 border-b gap-2">
      <button
        type="button"
        onClick={onFilterClick}
        className={cn(
          "p-1 rounded hover:bg-muted transition-colors",
          isFilterActive && "text-blue-500"
        )}
        aria-label="Toggle filter"
      >
        <Filter className="w-4 h-4" />
      </button>
      <span className="flex-1 font-semibold text-sm">Objects</span>
      <button
        type="button"
        onClick={onAddClick}
        className="p-1 rounded hover:bg-muted transition-colors"
        aria-label="Add element"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function FilterDropdown({
  elementFilter,
  assetFilter,
  allElements,
  allAssets,
  onToggleElement,
  onToggleAsset,
  onToggleAllElements,
  onToggleAllAssets,
}: {
  elementFilter: Set<ObjectElementType>;
  assetFilter: Set<SpreadItemMediaType>;
  allElements: boolean;
  allAssets: boolean;
  onToggleElement: (type: ObjectElementType) => void;
  onToggleAsset: (type: SpreadItemMediaType) => void;
  onToggleAllElements: () => void;
  onToggleAllAssets: () => void;
}) {
  return (
    <div className="border-b p-3 space-y-3 text-xs">
      <div>
        <p className="font-semibold mb-1 text-muted-foreground uppercase tracking-wider">
          Element Type
        </p>
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allElements}
            onChange={onToggleAllElements}
            className="rounded"
          />
          All
        </label>
        <div className="grid grid-cols-2 gap-1">
          {ALL_ELEMENT_TYPES.map((type) => {
            const config = ELEMENT_TYPE_CONFIG[type];
            return (
              <label
                key={type}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={allElements || elementFilter.has(type)}
                  onChange={() => onToggleElement(type)}
                  className="rounded"
                />
                <config.icon className="w-3 h-3" />
                {config.label}
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <p className="font-semibold mb-1 text-muted-foreground uppercase tracking-wider">
          Asset Type
        </p>
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allAssets}
            onChange={onToggleAllAssets}
            className="rounded"
          />
          All
        </label>
        <div className="grid grid-cols-2 gap-1">
          {ALL_ASSET_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center gap-1.5 cursor-pointer capitalize"
            >
              <input
                type="checkbox"
                checked={allAssets || assetFilter.has(type)}
                onChange={() => onToggleAsset(type)}
                className="rounded"
              />
              {type}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddElementDropdown({
  onAdd,
  onClose,
}: {
  onAdd: (type: ObjectElementType) => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b py-1">
      {ALL_ELEMENT_TYPES.map((type) => {
        const config = ELEMENT_TYPE_CONFIG[type];
        return (
          <button
            key={type}
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => {
              onAdd(type);
              onClose();
            }}
          >
            <config.icon className="w-4 h-4" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// === Main Component ===

export function ObjectsSidebar({
  selectedSpreadId,
  selectedItemId,
  onItemSelect,
}: ObjectsSidebarProps) {
  const spread = useRetouchSpreadById(selectedSpreadId);
  const actions = useSnapshotActions();

  // Local UI state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [lockedItems, setLockedItems] = useState<Set<string>>(new Set());

  // Filter state (all checked by default)
  const [elementFilter, setElementFilter] = useState<Set<ObjectElementType>>(
    new Set(ALL_ELEMENT_TYPES)
  );
  const [assetFilter, setAssetFilter] = useState<Set<SpreadItemMediaType>>(
    new Set(ALL_ASSET_TYPES)
  );
  const [allElements, setAllElements] = useState(true);
  const [allAssets, setAllAssets] = useState(true);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Build + filter object list
  const allEntries = useMemo(() => {
    if (!spread) return [];
    return buildObjectList(spread, lockedItems);
  }, [spread, lockedItems]);

  const filteredEntries = useMemo(
    () =>
      filterObjectList(
        allEntries,
        elementFilter,
        assetFilter,
        allElements,
        allAssets
      ),
    [allEntries, elementFilter, assetFilter, allElements, allAssets]
  );

  const isFilterActive = !allElements || !allAssets;

  // === Handlers ===

  const handleItemClick = useCallback(
    (entry: ObjectListEntry) => {
      onItemSelect({ type: entry.type, id: entry.id });
    },
    [onItemSelect]
  );

  const handleVisibilityToggle = useCallback(
    (entry: ObjectListEntry) => {
      const newVisible = !entry.editorVisible;
      log.debug("handleVisibilityToggle", "toggling visibility", {
        id: entry.id,
        type: entry.type,
        newVisible,
      });

      const updates = { editor_visible: newVisible };
      switch (entry.type) {
        case "image":
          actions.updateRetouchImage(selectedSpreadId, entry.id, updates);
          break;
        case "text":
          actions.updateRetouchTextbox(
            selectedSpreadId,
            entry.id,
            updates as Partial<SpreadTextbox>
          );
          break;
        case "shape":
          actions.updateRetouchShape(selectedSpreadId, entry.id, updates);
          break;
        case "video":
          actions.updateRetouchVideo(selectedSpreadId, entry.id, updates);
          break;
        case "audio":
          actions.updateRetouchAudio(selectedSpreadId, entry.id, updates);
          break;
        case "quiz":
          actions.updateRetouchQuiz(selectedSpreadId, entry.id, updates);
          break;
      }
    },
    [actions, selectedSpreadId]
  );

  const handleLockToggle = useCallback((entryId: string) => {
    setLockedItems((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  const handleEditStart = useCallback((entry: ObjectListEntry) => {
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
    switch (entry.type) {
      case "image":
        actions.updateRetouchImage(selectedSpreadId, entry.id, titleUpdate);
        break;
      case "text":
        actions.updateRetouchTextbox(
          selectedSpreadId,
          entry.id,
          titleUpdate as Partial<SpreadTextbox>
        );
        break;
      case "video":
        actions.updateRetouchVideo(selectedSpreadId, entry.id, titleUpdate);
        break;
      case "audio":
        actions.updateRetouchAudio(selectedSpreadId, entry.id, titleUpdate);
        break;
      // Shape and Quiz don't have title field — skip
    }
    setEditingItemId(null);
  }, [editingItemId, editValue, allEntries, actions, selectedSpreadId]);

  // DnD handlers
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => {
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        return;
      }
      log.info("handleDrop", "reordering", {
        from: dragIndex,
        to: targetIndex,
      });

      // Reorder entries and reassign z-index values
      const reordered = [...filteredEntries];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      // Update z-index for each item (top of list = highest z-index)
      reordered.forEach((entry, idx) => {
        const newZIndex = reordered.length - idx;
        if (entry.zIndex === newZIndex) return;

        switch (entry.type) {
          case "image":
            actions.updateRetouchImage(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            });
            break;
          case "video":
            actions.updateRetouchVideo(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            });
            break;
          case "audio":
            actions.updateRetouchAudio(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            });
            break;
          case "quiz":
            actions.updateRetouchQuiz(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            });
            break;
          // shape/text: z-index is array position — drag disabled for these types
        }
      });

      setDragIndex(null);
    },
    [dragIndex, filteredEntries, actions, selectedSpreadId]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  // Add element
  const handleAddElement = useCallback(
    (type: ObjectElementType) => {
      log.info("handleAddElement", "adding", { type });
      const topZIndex =
        allEntries.length > 0
          ? Math.max(...allEntries.map((e) => e.zIndex)) + 1
          : 1;

      switch (type) {
        case "image":
          actions.addRetouchImage(selectedSpreadId, {
            id: crypto.randomUUID(),
            title: "New Image",
            geometry: { x: 10, y: 10, w: 30, h: 30 },
            illustrations: [],
            "z-index": topZIndex,
            editor_visible: true,
            player_visible: true,
          } as SpreadImage);
          break;
        case "text":
          actions.addRetouchTextbox(selectedSpreadId, {
            id: crypto.randomUUID(),
            title: "New Text",
            en_US: {
              text: "",
              geometry: { x: 10, y: 10, w: 30, h: 15 },
              typography: {
                family: "Arial",
                size: 14,
                weight: 400,
                style: "normal",
                textAlign: "left",
                lineHeight: 1.5,
                letterSpacing: 0,
                color: "#000000",
                decoration: "none",
                textTransform: "none",
              },
            },
            editor_visible: true,
            player_visible: true,
          } as SpreadTextbox);
          break;
        case "shape":
          actions.addRetouchShape(selectedSpreadId, {
            id: crypto.randomUUID(),
            type: "rectangle",
            geometry: { x: 10, y: 10, w: 20, h: 20 },
            fill: { is_filled: true, color: "#3b82f6", opacity: 1 },
            outline: { color: "#000000", width: 1, radius: 0, type: 0 },
            editor_visible: true,
            player_visible: true,
          } as SpreadShape);
          break;
        case "video":
          actions.addRetouchVideo(selectedSpreadId, {
            id: crypto.randomUUID(),
            name: "New Video",
            title: "New Video",
            geometry: { x: 10, y: 10, w: 30, h: 20 },
            "z-index": topZIndex,
            editor_visible: true,
            player_visible: true,
            type: "raw",
          } as SpreadVideo);
          break;
        case "audio":
          actions.addRetouchAudio(selectedSpreadId, {
            id: crypto.randomUUID(),
            name: "New Audio",
            title: "New Audio",
            geometry: { x: 10, y: 10, w: 0, h: 0 },
            "z-index": topZIndex,
            editor_visible: true,
            player_visible: true,
            type: "raw",
          } as SpreadAudio);
          break;
        case "quiz":
          actions.addRetouchQuiz(selectedSpreadId, {
            id: crypto.randomUUID(),
            geometry: { x: 20, y: 20, w: 0, h: 0 },
            "z-index": topZIndex,
            editor_visible: true,
            player_visible: true,
            options: [],
          } as SpreadQuiz);
          break;
      }
    },
    [actions, selectedSpreadId, allEntries]
  );

  // Filter toggles
  const handleToggleElement = useCallback((type: ObjectElementType) => {
    setAllElements(false);
    setElementFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (next.size === ALL_ELEMENT_TYPES.length) setAllElements(true);
      return next;
    });
  }, []);

  const handleToggleAsset = useCallback((type: SpreadItemMediaType) => {
    setAllAssets(false);
    setAssetFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (next.size === ALL_ASSET_TYPES.length) setAllAssets(true);
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

  const handleToggleAllAssets = useCallback(() => {
    setAllAssets((prev) => {
      if (!prev) setAssetFilter(new Set(ALL_ASSET_TYPES));
      else setAssetFilter(new Set());
      return !prev;
    });
  }, []);

  if (!spread) return null;

  return (
    <nav
      className="w-[280px] flex flex-col h-full border-r bg-background"
      role="listbox"
      aria-label="Objects list"
    >
      <SidebarHeader
        onFilterClick={() => {
          setIsFilterOpen((p) => !p);
          setIsAddOpen(false);
        }}
        onAddClick={() => {
          setIsAddOpen((p) => !p);
          setIsFilterOpen(false);
        }}
        isFilterActive={isFilterActive}
      />

      {isFilterOpen && (
        <FilterDropdown
          elementFilter={elementFilter}
          assetFilter={assetFilter}
          allElements={allElements}
          allAssets={allAssets}
          onToggleElement={handleToggleElement}
          onToggleAsset={handleToggleAsset}
          onToggleAllElements={handleToggleAllElements}
          onToggleAllAssets={handleToggleAllAssets}
        />
      )}

      {isAddOpen && (
        <AddElementDropdown
          onAdd={handleAddElement}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {allEntries.length === 0 ? "No elements" : "No matching elements"}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filteredEntries.map((entry, index) => (
            <ObjectListItem
              key={entry.id}
              entry={entry}
              index={index}
              isSelected={selectedItemId?.id === entry.id}
              editingId={editingItemId}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onSelect={() => handleItemClick(entry)}
              onVisibilityToggle={() => handleVisibilityToggle(entry)}
              onLockToggle={() => handleLockToggle(entry.id)}
              onEditStart={() => handleEditStart(entry)}
              onRenameConfirm={handleRenameConfirm}
              dragIndex={dragIndex}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

export default ObjectsSidebar;
