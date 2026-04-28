// spread-types.ts - Shared domain types used across canvas and playable spread views
// Centralized from components/shared/types.ts

import type { BranchSetting } from './illustration-types';

// === Unified Item Type (canvas + playable merged) ===
export type ItemType =
  | "image"
  | "textbox"
  | "raw_image"
  | "raw_textbox"
  | "shape"
  | "video"
  | "auto_pic"
  | "audio"
  | "quiz";

// === Geometry Types ===
export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  w: number; // percentage 0-100
  h: number; // percentage 0-100
}

// === Typography ===
export interface Typography {
  size?: number;
  weight?: number;
  style?: "normal" | "italic";
  family?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  decoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
}

// === Shape Fill & Outline ===
export interface ShapeFill {
  is_filled: boolean;
  color: string;
  opacity: number;
}

export interface ShapeOutline {
  color: string;
  width: number;
  radius: number;
  type: 0 | 1 | 2; // 0=solid, 1=dashed, 2=dotted
}

// === Spread Shape ===
export interface SpreadShape {
  id: string;
  type: "rectangle";
  title?: string;
  geometry: Geometry;
  fill: ShapeFill;
  outline: ShapeOutline;
  // Retouch only
  "z-index"?: number;
  player_visible?: boolean;
  editor_visible?: boolean;
}

// === Spread Video ===
export type SpreadItemMediaType =
  | "raw"
  | "character"
  | "prop"
  | "background"
  | "foreground"
  | "other";

export interface SpreadVideo {
  id: string;
  title?: string;
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  original_image_id?: string;
  name: string;
  variant?: string;
  type: SpreadItemMediaType;
  media_url?: string;
}

/** Infinite-loop animated media layer. Shape identical to SpreadVideo — differentiated by
 *  runtime rendering contract (no play/pause UI, auto-loop forever).
 *  See snapshot/illustration-structure.md#auto_pics */
export interface SpreadAutoPic {
  id: string;
  title?: string;
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  original_image_id?: string;
  name: string;
  variant?: string;
  type: SpreadItemMediaType;
  media_url?: string; // .webp (animated) | .webm (loop=true) | .lottie | .riv
  /** dotLottie v2 renderer hints — absent means use library defaults */
  lottie?: {
    theme?: string;         // dotLottie v2 theme id
    state_machine?: string; // state machine id; absent → default animation
    speed?: number;         // default 1
  };
  /** Rive renderer hints — absent means use library defaults */
  rive?: {
    artboard?: string;      // default: file's default artboard
    animation?: string;     // default: 'Idle' or first linear animation
    state_machine?: string; // mutually exclusive with animation; wins if both present
    fit?: 'contain' | 'cover' | 'fill' | 'fitWidth' | 'fitHeight' | 'none' | 'scaleDown'; // default: 'contain'
  };
}

// === Spread Audio ===
export interface SpreadAudio {
  id: string;
  title?: string;
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  name: string;
  variant?: string;
  type: SpreadItemMediaType;
  media_url?: string;
  media_length?: number; // duration in milliseconds, populated on pick/upload
}

// === Quiz v2 — see 11-quiz-slice.md. Breaking change [2026-04-11]. ===

// Quiz type discriminator
export const QUIZ_TYPE = {
  SINGLE_SELECT: 0,
  MATCHING: 1,
  SEQUENCE: 2,
  DRAG_DROP: 3,
  HOTSPOT: 4,
} as const;
export type QuizType = typeof QUIZ_TYPE[keyof typeof QUIZ_TYPE];

// answer_setting — flat union, consumer đọc subset theo `type`
export interface QuizAnswerSetting {
  has_correct_answer: boolean;
  shuffle: boolean;
  layout?: 0 | 1 | 2;                                    // type 0
  relation?: '1:1' | '1:n' | 'n:1';                       // type 1
  arrow?: 'none' | 'right' | 'left' | 'bidirectional';    // type 1
  is_cycle?: boolean;                                     // type 2
  snap_target?: 0 | 1;                                    // type 3
  snap_type?: 0 | 1;                                      // type 3
  replace_previous?: boolean;                             // type 3
  limit_responses?: boolean;                              // type 4
  before_replay?: 0 | 1;                                  // type 3, 4
}

// quiz_container — outer frame config
export interface QuizContainer {
  question_audio_auto_play: boolean;
  background: { is_filled: boolean; color?: string; image_url?: string };
  skip: { allow: boolean; delay: number };
  replay: { allow: boolean; count: number };
}

// item_container — per-role style
export type ItemContainerRole = 'default' | 'source' | 'target';

export interface ItemContainerStyle {
  display: { image: boolean; audio: boolean; text: boolean };
  background: { is_filled: boolean; color: string };
  border: { is_filled: boolean; color: string };
  text: { size: number; color: string; align: 'left' | 'center' | 'right' };
  w: number;
  h: number;
}

// type 0, 2, 3, 4 → { default }
// type 1         → { source; target }
export type ItemContainer = Partial<Record<ItemContainerRole, ItemContainerStyle>>;

// elements.items
export interface QuizItemContent {
  text?: string;
  audio_url?: string;
}

export interface QuizItem {
  id: string;
  name: string;                              // reference @character/@prop key
  variant?: string;
  geometry: { x: number; y: number };         // % relative on quiz canvas (NOT Geometry)
  image_url?: string;
  is_correct?: boolean;                       // type 0 only
  type?: 'source' | 'target';                  // type 1 only
  order?: number | null;                      // type 2 only — null = distractor
  drop_target_id?: string;                    // type 3 only — FK → target_zones[].id
  [languageKey: string]:
    | QuizItemContent
    | string
    | number
    | boolean
    | { x: number; y: number }
    | null
    | undefined;
}

export interface QuizPair {
  source_id: string;                          // FK → items[].id (type = 'source')
  target_id: string;                          // FK → items[].id (type = 'target')
}

export interface QuizTargetZone {
  id: string;
  name: string;
  type: 0 | 1 | 2;                             // 0=rectangle | 1=oval | 2=triangle
  geometry: Geometry;
  background?: boolean;                        // type 3 only
  background_color?: string;                   // type 3 only
  border?: boolean;                            // type 3 only
  border_color?: string;                       // type 3 only
}

export interface QuizDecorImage {
  name: string;
  image_url: string;
  geometry: Geometry;
}

export interface QuizElements {
  items?: QuizItem[];                          // types 0, 1, 2, 3
  pairs?: QuizPair[];                          // type 1
  target_zones?: QuizTargetZone[];             // types 3, 4
  images?: QuizDecorImage[];                   // types 3, 4
}

// Quiz-level localized content (question + audio)
export interface SpreadQuizLocalized {
  question: string;
  audio_url?: string;
}

// === Spread Quiz (v2) ===
export interface SpreadQuiz {
  id: string;
  title: string;                               // editor-only plain string (NOT localized)
  type: QuizType;                              // immutable after create
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  answer_setting: QuizAnswerSetting;
  quiz_container: QuizContainer;
  item_container: ItemContainer;
  elements: QuizElements;
  [languageKey: string]:
    | SpreadQuizLocalized
    | QuizType
    | Geometry
    | QuizAnswerSetting
    | QuizContainer
    | ItemContainer
    | QuizElements
    | string
    | number
    | boolean
    | undefined;
}

// === Page Types ===
export interface PageData {
  number: string | number;
  type: "normal_page" | "front_matter" | "back_matter" | "dedication";
  layout: string | null;
  background: {
    color: string;
    texture: string | null;
  };
}

// === Spread Item Types ===
export interface SpreadImage {
  id: string;
  title?: string;
  geometry: Geometry;
  stage_variant?: string;
  art_note?: string;
  visual_description?: string;
  image_references?: Array<{ title: string; media_url: string }>;

  // Sketch images (step 2) - direct URL, no illustration variants
  media_url?: string;

  // Illustration images (step 3) - multiple variants, one selected
  illustrations?: Array<{
    media_url: string;
    created_time: string;
    is_selected: boolean;
  }>;
  final_hires_media_url?: string;

  // Retouch-specific optional fields
  "z-index"?: number;
  player_visible?: boolean;
  editor_visible?: boolean;
  aspect_ratio?: string;
  original_image_id?: string;
  name?: string;
  state?: string;
  type?: SpreadItemMediaType;
}

export interface SpreadTextbox {
  id: string;
  title?: string;
  [languageKey: string]: SpreadTextboxContent | string | boolean | number | undefined;
  // Retouch only
  "z-index"?: number;
  player_visible?: boolean;
  editor_visible?: boolean;
}

// === Textbox Audio (retouch phase TTS) ===
// Shape: ai-storybook-design/snapshot/illustration-structure.md#textboxes
// API contract: ai-storybook-design/api/text-generation/02-narrate-script.md

/** Per-word timing within a NarrationSegment. `text` = the word glyph,
 *  charStart/charEnd = offset into segment.text so UI can highlight ranges. */
export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
}

/** Turn-level segment: one line per speaker with resolved voice_id.
 *  Persisted form of API `NarrationSegment` — camelCase `voiceId` renamed to
 *  snake_case `voice_id` via `mapApiSegmentToSnapshot`. */
export interface NarrationSegment {
  index: number;
  voice_id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: WordTiming[];
}

/** Raw ElevenLabs alignment. Persisted verbatim for forward compat. */
export interface RawAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
  [key: string]: unknown;
}

/** Generated audio + timing metadata for a textbox. Single object; null when
 *  not generated yet. */
export interface TextboxAudioMedia {
  url: string;
  duration_ms: number;
  output_format: string;
  path_key: string;
  script_synced: boolean;
  generated_at: string;
  segments: NarrationSegment[];
  raw_alignment: RawAlignment;
}

/** User-tunable ElevenLabs v3 settings persisted with each textbox. */
export interface TextboxAudioSettings {
  model: string;
  stability: number;
  similarity: number;
  style_exaggeration: number;
  speed: number;
  speaker_boost: boolean;
  seed: number | null;
}

export interface TextboxAudio {
  script: string;
  settings: TextboxAudioSettings;
  media: TextboxAudioMedia | null;
}

export interface SpreadTextboxContent {
  text: string;
  geometry: Geometry;
  typography: Typography;
  audio?: TextboxAudio; // retouch phase only
}

export interface SpreadAnimation {
  order: number;
  type: 0 | 1; // 0=story timeline, 1=object interactive
  group?: string;
  target: {
    id: string;
    type: "textbox" | "image" | "video" | "auto_pic" | "audio" | "shape" | "quiz";
  };
  trigger_type: "on_click" | "on_next" | "with_previous" | "after_previous";
  click_loop?: number;
  must_complete?: boolean;
  effect: {
    type: number;
    geometry?: Geometry;
    delay?: number;
    duration?: number;
    loop?: number;
    amount?: number;
    direction?: "left" | "right" | "up" | "down";
  };
}

// === Base Spread Interface ===
export interface BaseSpread {
  id: string;
  pages: PageData[];

  // Raw layers (illustration phase — editor-only, player_visible always false)
  raw_images?: SpreadImage[];
  raw_textboxes?: SpreadTextbox[];

  // Playable layers (retouch phase — player + editor visible)
  images: SpreadImage[];
  textboxes: SpreadTextbox[];
  shapes?: SpreadShape[];
  videos?: SpreadVideo[];
  auto_pics?: SpreadAutoPic[];
  audios?: SpreadAudio[];
  quizzes?: SpreadQuiz[];
  animations?: SpreadAnimation[];

  manuscript?: string;
  tiny_sketch_media_url?: string;
  branch_setting?: BranchSetting;
  next_spread_id?: string | null;
}
