// Adapters between ObjectsCreativeSpace's SelectedItem (ObjectElementType superset)
// and animation-types' SelectedItem (ItemType subset).
// Extracted to a sibling file so the container module is fast-refresh friendly.

import type {
  SelectedItem as AnimationSelectedItem,
  ItemType,
} from "@/types/animation-types";

export type ObjectElementType =
  | "image"
  | "shape"
  | "video"
  | "audio"
  | "auto_audio"
  | "textbox"
  | "auto_pic"
  | "composite"
  | "raw_image"
  | "raw_textbox";

export interface SelectedItem {
  type: ObjectElementType;
  id: string;
}

const ANIMATION_COMPATIBLE: ReadonlyArray<ItemType> = [
  "image",
  "textbox",
  "shape",
  "video",
  "auto_pic",
  "audio",
  "auto_audio",
  "composite",
];

/**
 * Map ObjectsCreativeSpace.SelectedItem → animation-types.SelectedItem.
 * ObjectElementType is a superset: raw_image/raw_textbox/quiz not in ItemType.
 */
export function adaptToAnimationSelectedItem(
  item: SelectedItem | null,
): AnimationSelectedItem | null {
  if (!item) return null;
  if (item.type === "raw_image") return { type: "image", id: item.id };
  if (item.type === "raw_textbox") return { type: "textbox", id: item.id };
  if ((ANIMATION_COMPATIBLE as readonly string[]).includes(item.type)) {
    return { type: item.type as ItemType, id: item.id };
  }
  return null;
}

/**
 * Map animation-types.SelectedItem → ObjectsCreativeSpace.SelectedItem.
 * ItemType is a subset of ObjectElementType — cast is safe.
 */
export function adaptFromAnimationItem(
  itemType: ItemType | null,
  itemId: string | null,
): SelectedItem | null {
  if (!itemType || !itemId) return null;
  return { type: itemType as ObjectElementType, id: itemId };
}
