// objects-sidebar.tsx - Left sidebar listing all objects in selected spread
// Items are grouped by z-index layers with dividers; drag is restricted within same layer.
"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  Filter,
  Eye,
  EyeOff,
  Globe,
  Smile,
  Box,
  Image as ImageIcon,
  Square,
  CircleDot,
} from "lucide-react";
import { cn } from "@/utils/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  useRetouchSpreadById,
  useSnapshotActions,
} from "@/stores/snapshot-store/selectors";
import { createLogger } from "@/utils/logger";
import { useLanguageCode } from "@/stores/editor-settings-store";
import {
  ObjectListItem,
  ELEMENT_TYPE_CONFIG,
  type ObjectListEntry,
} from "./objects-sidebar-list-item";
import {
  buildObjectList,
  filterObjectList,
  groupEntriesByLayer,
  getLayerForType,
  type LayerGroup,
} from "./utils";
import type { SelectedItem, ObjectElementType } from "./objects-creative-space";
import type {
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
} from "@/types/canvas-types";
import type { SpreadItemMediaType } from "@/types/spread-types";

const log = createLogger("Editor", "ObjectsSidebar");

const ALL_ELEMENT_TYPES: ObjectElementType[] = [
  "image",
  "textbox",
  "shape",
  "video",
  "audio",
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

// === Asset type icon mapping ===

import type { LucideIcon } from "lucide-react";

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

// === Inline sub-components ===

/** Filter popover content */
function FilterPopoverContent({
  assetFilter,
  allAssets,
  onToggleAsset,
  onToggleAllAssets,
}: {
  assetFilter: Set<SpreadItemMediaType>;
  allAssets: boolean;
  onToggleAsset: (type: SpreadItemMediaType) => void;
  onToggleAllAssets: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p className="font-semibold text-base">Filter</p>

      {/* BY OBJECT TYPE (asset/media types) */}
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
        {ALL_ASSET_TYPES.map((type) => {
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

/** Add element popover content */
function AddElementPopoverContent({
  onAdd,
}: {
  onAdd: (type: ObjectElementType) => void;
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

/** Visual divider between layer groups */
function LayerDivider({
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

// === Main Component ===

export function ObjectsSidebar({
  selectedSpreadId,
  selectedItemId,
  onItemSelect,
}: ObjectsSidebarProps) {
  const spread = useRetouchSpreadById(selectedSpreadId);
  const actions = useSnapshotActions();
  const editorLangCode = useLanguageCode();

  // Local UI state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Filter state (all checked by default)
  const [assetFilter, setAssetFilter] = useState<Set<SpreadItemMediaType>>(
    new Set(ALL_ASSET_TYPES)
  );
  const [allAssets, setAllAssets] = useState(true);

  // Drag state: layerLabel tracks which layer the drag started in
  const [dragLayerLabel, setDragLayerLabel] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Build + filter object list
  const allEntries = useMemo(() => {
    if (!spread) return [];
    return buildObjectList(spread, editorLangCode);
  }, [spread, editorLangCode]);

  const filteredEntries = useMemo(
    () =>
      filterObjectList(
        allEntries,
        new Set(ALL_ELEMENT_TYPES),
        assetFilter,
        true,
        allAssets
      ),
    [allEntries, assetFilter, allAssets]
  );

  // Group filtered entries by layer (top z-index layer first)
  const layerGroups = useMemo(
    () => groupEntriesByLayer(filteredEntries),
    [filteredEntries]
  );

  const isFilterActive = !allAssets;

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
        case "textbox":
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
        case "raw_image":
          actions.updateRawImage(selectedSpreadId, entry.id, updates);
          break;
        case "raw_textbox":
          actions.updateRawTextbox(
            selectedSpreadId,
            entry.id,
            updates as Partial<SpreadTextbox>
          );
          break;
      }
    },
    [actions, selectedSpreadId]
  );

  const handleLayerVisibilityToggle = useCallback(
    (group: LayerGroup) => {
      const layerEntries = allEntries.filter((e) => {
        const eLayer = getLayerForType(e.type);
        return eLayer?.label === group.layer.label;
      });
      const anyVisible = layerEntries.some((e) => e.editorVisible);
      const newVisible = !anyVisible;

      log.debug("handleLayerVisibilityToggle", "toggling layer", {
        layer: group.layer.label,
        count: layerEntries.length,
        newVisible,
      });

      for (const entry of layerEntries) {
        const updates = { editor_visible: newVisible };
        switch (entry.type) {
          case "image":
            actions.updateRetouchImage(selectedSpreadId, entry.id, updates);
            break;
          case "textbox":
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
          case "raw_image":
            actions.updateRawImage(selectedSpreadId, entry.id, updates);
            break;
          case "raw_textbox":
            actions.updateRawTextbox(
              selectedSpreadId,
              entry.id,
              updates as Partial<SpreadTextbox>
            );
            break;
        }
      }
    },
    [allEntries, actions, selectedSpreadId]
  );

  const handlePlayerVisibilityToggle = useCallback(
    (entry: ObjectListEntry) => {
      const newVisible = !entry.playerVisible;
      log.debug("handlePlayerVisibilityToggle", "toggling player_visible", {
        id: entry.id,
        type: entry.type,
        newVisible,
      });

      const updates = { player_visible: newVisible };
      switch (entry.type) {
        case "image":
          actions.updateRetouchImage(selectedSpreadId, entry.id, updates);
          break;
        case "textbox":
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
        case "raw_image":
          actions.updateRawImage(selectedSpreadId, entry.id, updates);
          break;
        case "raw_textbox":
          actions.updateRawTextbox(
            selectedSpreadId,
            entry.id,
            updates as Partial<SpreadTextbox>
          );
          break;
      }
    },
    [actions, selectedSpreadId]
  );

  const handleEditStart = useCallback((entry: ObjectListEntry) => {
    if (entry.type === "textbox") return; // textbox title is auto-derived
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
      case "video":
        actions.updateRetouchVideo(selectedSpreadId, entry.id, titleUpdate);
        break;
      case "audio":
        actions.updateRetouchAudio(selectedSpreadId, entry.id, titleUpdate);
        break;
      case "shape":
        actions.updateRetouchShape(
          selectedSpreadId,
          entry.id,
          titleUpdate as Partial<SpreadShape>
        );
        break;
    }
    setEditingItemId(null);
  }, [editingItemId, editValue, allEntries, actions, selectedSpreadId]);

  // === Layer-scoped DnD handlers ===

  const handleDragStart = useCallback((index: number, layerLabel: string) => {
    setDragIndex(index);
    setDragLayerLabel(layerLabel);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  /**
   * Handle drop within a specific layer group.
   * Reassigns z-index values within that layer's range only.
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

      log.info("handleLayerDrop", "reordering within layer", {
        layer: group.layer.label,
        from: dragIndex,
        to: targetIndex,
      });

      const reordered = [...group.entries];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      const { min, max } = group.layer;
      const count = reordered.length;

      // Distribute z-index within layer range, highest first
      reordered.forEach((entry, idx) => {
        const newZIndex = Math.min(max, min + (count - 1 - idx));

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
          case "shape":
            actions.updateRetouchShape(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            } as Partial<SpreadShape>);
            break;
          case "textbox":
            actions.updateRetouchTextbox(selectedSpreadId, entry.id, {
              "z-index": newZIndex,
            } as Partial<SpreadTextbox>);
            break;
        }
      });

      setDragIndex(null);
      setDragLayerLabel(null);
    },
    [dragIndex, dragLayerLabel, actions, selectedSpreadId]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragLayerLabel(null);
  }, []);

  // Add element with z-index within its layer range
  const handleAddElement = useCallback(
    (type: ObjectElementType) => {
      log.info("handleAddElement", "adding", { type });

      // Determine z-index: top of its layer
      const layer = getLayerForType(type);
      let newZIndex: number = layer ? layer.min : 1;
      if (layer) {
        const sameLayerEntries = allEntries.filter((e) => {
          const eLayer = getLayerForType(e.type);
          return eLayer === layer;
        });
        if (sameLayerEntries.length > 0) {
          const maxInLayer = Math.max(...sameLayerEntries.map((e) => e.zIndex));
          newZIndex = Math.min(maxInLayer + 1, layer.max);
        }
      }

      const newId = crypto.randomUUID();

      switch (type) {
        case "image":
          actions.addRetouchImage(selectedSpreadId, {
            id: newId,
            title: "New Image",
            geometry: { x: 10, y: 10, w: 30, h: 30 },
            illustrations: [],
            "z-index": newZIndex,
            editor_visible: true,
            player_visible: true,
          } as SpreadImage);
          break;
        case "textbox":
          actions.addRetouchTextbox(selectedSpreadId, {
            id: newId,
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
            id: newId,
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
            id: newId,
            name: "New Video",
            title: "New Video",
            geometry: { x: 10, y: 10, w: 30, h: 20 },
            "z-index": newZIndex,
            editor_visible: true,
            player_visible: true,
            type: "raw",
          } as SpreadVideo);
          break;
        case "audio":
          actions.addRetouchAudio(selectedSpreadId, {
            id: newId,
            name: "New Audio",
            title: "New Audio",
            geometry: { x: 10, y: 10, w: 0, h: 0 },
            "z-index": newZIndex,
            editor_visible: true,
            player_visible: true,
            type: "raw",
          } as SpreadAudio);
          break;
      }

      // Auto-select newly added item
      onItemSelect({ type, id: newId });
    },
    [actions, selectedSpreadId, allEntries, onItemSelect]
  );

  // Filter toggles
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
      {/* Header with Popover-based Filter & Add */}
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
          <PopoverContent align="start" sideOffset={8} className="w-64">
            <FilterPopoverContent
              assetFilter={assetFilter}
              allAssets={allAssets}
              onToggleAsset={handleToggleAsset}
              onToggleAllAssets={handleToggleAllAssets}
            />
          </PopoverContent>
        </Popover>

        <span className="flex-1 font-semibold text-sm">Objects</span>

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
            <AddElementPopoverContent
              onAdd={(type) => {
                handleAddElement(type);
                setIsAddOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {allEntries.length === 0 ? "No elements" : "No matching elements"}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {layerGroups.map((group) => {
            const layerItems = allEntries.filter(
              (e) => getLayerForType(e.type)?.label === group.layer.label
            );
            const layerAllVisible =
              layerItems.length > 0 && layerItems.some((e) => e.editorVisible);
            return (
              <div key={group.layer.label}>
                <LayerDivider
                  label={group.layer.label}
                  allVisible={layerAllVisible}
                  onToggleVisibility={() =>
                    handleLayerVisibilityToggle(group)
                  }
                />
                {/* Items within this layer */}
                {group.entries.map((entry, index) => (
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
                    onPlayerVisibilityToggle={() =>
                      handlePlayerVisibilityToggle(entry)
                    }
                    onEditStart={() => handleEditStart(entry)}
                    onRenameConfirm={handleRenameConfirm}
                    dragIndex={
                      dragLayerLabel === group.layer.label ? dragIndex : null
                    }
                    onDragStart={(idx) =>
                      handleDragStart(idx, group.layer.label)
                    }
                    onDragOver={handleDragOver}
                    onDrop={(idx) => handleLayerDrop(idx, group)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export default ObjectsSidebar;
