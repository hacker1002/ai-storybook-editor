// animation-constants.ts - Mapping constants for AnimationsCreativeSpace feature

import type { EffectCategory, TargetItemIcon } from "@/types/animation-types";
import { EFFECT_TYPE, EFFECT_TYPE_NAMES } from "@/constants/playable-constants";

// Re-export for convenience
export { EFFECT_TYPE, EFFECT_TYPE_NAMES };

export const EFFECT_CATEGORY_MAP: Record<number, EffectCategory> = {
  1: "play",
  2: "entrance",
  3: "entrance",
  4: "entrance",
  5: "entrance",
  6: "entrance",
  7: "emphasis",
  8: "emphasis",
  9: "emphasis",
  10: "emphasis",
  11: "read-along",
  12: "exit",
  13: "exit",
  14: "exit",
  15: "exit",
  16: "motion-paths",
  17: "motion-paths",
  18: "camera",
  19: "camera",
};

export const STAR_COLOR_MAP: Record<EffectCategory, string> = {
  play: "#3B82F6",
  "read-along": "#A855F7",
  entrance: "#22C55E",
  emphasis: "#EAB308",
  exit: "#EF4444",
  "motion-paths": "#3B82F6",
  camera: "#F97316",
};

export const EFFECT_OPTIONS_MAP: Record<number, string[]> = {
  1: ["delay", "loop"],
  2: ["delay"],
  3: ["delay", "duration"],
  4: ["delay", "duration", "direction"],
  5: ["delay", "duration", "direction"],
  6: ["delay", "duration", "amount"],
  7: ["delay", "duration", "loop", "amount", "direction"],
  8: ["delay", "duration", "amount", "direction"],
  9: ["delay", "duration", "loop"],
  10: ["delay", "duration"],
  11: ["delay"],
  12: ["delay", "duration"],
  13: ["delay", "duration"],
  14: ["delay", "duration", "direction"],
  15: ["delay", "duration"],
  16: ["delay", "duration", "geometry"],
  17: ["delay", "duration"],
  18: ["delay", "duration", "payload.ease_time"],
  19: ["delay", "duration", "geometry", "payload.ease_time"],
};

export const TARGET_ICON_MAP: Record<string, TargetItemIcon> = {
  image: "image",
  textbox: "textbox",
  shape: "shape",
  video: "video",
  auto_pic: "auto_pic",
  audio: "audio",
  quiz: "quiz",
  composite: "composite",
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  on_next: "On Next",
  on_click: "On Click",
  with_previous: "With Previous",
  after_previous: "After Previous",
};

export const EFFECT_CATEGORY_LABELS: Record<EffectCategory, string> = {
  play: "Play",
  "read-along": "Read-along",
  entrance: "Entrance",
  emphasis: "Emphasis",
  exit: "Exit",
  "motion-paths": "Motion Paths",
  camera: "Camera",
};

// Effect grid filtering per target type.
// Arcs (17) deprecated 2026-05; reserved enum, render fallback to Lines (16).
// Entries kept in EFFECT_TYPE / EFFECT_TYPE_NAMES / EFFECT_CATEGORY_MAP /
// EFFECT_OPTIONS_MAP for legacy data parsing (animation list label, settings panel).
export const ALLOWED_EFFECTS_BY_TARGET: Record<string, number[]> = {
  audio: [1, 2, 12],
  video: [1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 18],
  // auto_pic: same effect matrix as videos[] minus Play (1).
  // EXCLUDED: 1 (Play — auto-loop, play/pause meaningless),
  //           6 (entrance variant — not supported for media),
  //           7-10 (Emphasis — conflicts with auto-loop animation),
  //           11 (Read-along — textbox-only),
  //           17 (Arcs — deprecated; legacy data still plays via Lines fallback).
  // DO NOT add these effects without updating EditableAutoPic loop handling.
  auto_pic: [2, 3, 4, 5, 12, 13, 14, 15, 16, 18],
  textbox: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18],
  image: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18],
  shape: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 18],
  quiz: [1],
  // ⚡ Camera Zoom (19) — sentinel target.type='spread', spread-level effect
  spread: [19],
};
