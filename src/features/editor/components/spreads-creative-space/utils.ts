// utils.ts - Types, constants, and helpers for spreads creative space sidebar

import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";
import { LAYER_CONFIG, LAYER_ORDER } from "@/constants/spread-constants";
import type { LucideIcon } from "lucide-react";
import { Image, Type, Hexagon } from "lucide-react";
import type {
  BaseSpread,
  SpreadImage,
  SpreadShape,
  SpreadTextbox,
} from "@/types/canvas-types";

// === Types ===

export type SpreadElementType = "image" | "textbox" | "shape";

export interface ElementListEntry {
  id: string;
  type: SpreadElementType;
  title: string;
  zIndex: number;
}

export interface SelectedItem {
  type: SpreadElementType;
  id: string;
}

type LayerRange = (typeof LAYER_CONFIG)[keyof typeof LAYER_CONFIG];

export interface LayerGroup {
  layer: LayerRange;
  entries: ElementListEntry[];
}

// === Constants ===

export const ALL_ELEMENT_TYPES: SpreadElementType[] = [
  "image",
  "textbox",
  "shape",
];

/** Map illustration element types to layer config (different from objects: 'textbox' not 'text') */
export const ILLUSTRATION_LAYER_MAP: Record<SpreadElementType, LayerRange> = {
  image: LAYER_CONFIG.MEDIA,
  shape: LAYER_CONFIG.OBJECTS,
  textbox: LAYER_CONFIG.TEXT,
};

export const ELEMENT_TYPE_CONFIG: Record<
  SpreadElementType,
  { icon: LucideIcon; label: string }
> = {
  image: { icon: Image, label: "Image" },
  textbox: { icon: Type, label: "Textbox" },
  shape: { icon: Hexagon, label: "Shape" },
};

export const NEW_ELEMENT_DEFAULTS = {
  image: {
    title: "Untitled Image",
    geometry: { x: 35, y: 20, w: 30, h: 40 },
    aspect_ratio: "1:1",
    setting: undefined,
    art_note: "",
    visual_description: "",
    image_references: [],
    final_hires_media_url: undefined,
    illustrations: [],
  },
  shape: {
    title: "New Shape",
    geometry: { x: 30, y: 30, w: 40, h: 30 },
    type: "rectangle" as const,
    fill: { is_filled: true, color: "#E0E0E0", opacity: 1 },
    outline: { color: "#999999", width: 1, radius: 0, type: 0 },
  },
};

/** Create default textbox with full language-keyed structure */
export function createDefaultTextbox(langCode: string): SpreadTextbox {
  return {
    id: crypto.randomUUID(),
    [langCode]: {
      text: "",
      geometry: { x: 20, y: 20, w: 60, h: 15 },
      typography: {
        family: "Nunito",
        size: 16,
        weight: 400,
        style: "normal",
        decoration: "none",
        textAlign: "left",
        color: "#000000",
      },
    },
  };
}

// === Helpers ===

/** Resolve z-index: use array position within layer range */
function resolveZIndex(positionInArray: number, layer: LayerRange): number {
  return Math.min(layer.min + positionInArray, layer.max);
}

/** Build flat list of all elements from a spread, sorted descending by z-index */
export function buildElementList(
  spread: BaseSpread,
  langCode: string
): ElementListEntry[] {
  const entries: ElementListEntry[] = [];

  spread.images.forEach((img, i) => {
    entries.push({
      id: img.id,
      type: "image",
      title: (img as SpreadImage).title || `Image ${i + 1}`,
      zIndex: resolveZIndex(i, LAYER_CONFIG.MEDIA),
    });
  });

  spread.textboxes.forEach((tb, i) => {
    const result = getTextboxContentForLanguage(
      tb as unknown as Record<string, unknown>,
      langCode
    );
    const text = result?.content?.text;
    const title = text
      ? text.length > 20
        ? text.slice(0, 20) + "\u2026"
        : text
      : "Empty Textbox";
    entries.push({
      id: tb.id,
      type: "textbox",
      title,
      zIndex: resolveZIndex(i, LAYER_CONFIG.TEXT),
    });
  });

  spread.shapes?.forEach((shape, i) => {
    entries.push({
      id: shape.id,
      type: "shape",
      title: (shape as SpreadShape).title || `Shape ${i + 1}`,
      zIndex: resolveZIndex(i, LAYER_CONFIG.OBJECTS),
    });
  });

  return entries.sort((a, b) => b.zIndex - a.zIndex);
}

/** Group entries by layer (TEXT -> OBJECTS -> MEDIA), removing empty groups */
export function groupEntriesByLayer(entries: ElementListEntry[]): LayerGroup[] {
  const groups: LayerGroup[] = LAYER_ORDER.map((layer) => ({
    layer,
    entries: [],
  }));

  for (const entry of entries) {
    const layer = ILLUSTRATION_LAYER_MAP[entry.type];
    if (!layer) continue;
    const group = groups.find((g) => g.layer === layer);
    group?.entries.push(entry);
  }

  for (const group of groups) {
    group.entries.sort((a, b) => b.zIndex - a.zIndex);
  }

  return groups.filter((g) => g.entries.length > 0);
}

/** Filter entries by element type set */
export function filterElementList(
  entries: ElementListEntry[],
  elementFilter: Set<SpreadElementType>,
  allElements: boolean
): ElementListEntry[] {
  if (allElements) return entries;
  return entries.filter((entry) => elementFilter.has(entry.type));
}
