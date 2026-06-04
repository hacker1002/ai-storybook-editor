// __mocks__/playable-spread-factory.ts - Mock factory for PlayableSpread data

import type { PlayableSpread } from "@/types/playable-types";
import type {
  SpreadAnimation,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  PageData,
  SpreadTextbox,
  SpreadImage,
  Geometry,
  Typography,
} from "@/types/spread-types";

// Internal placement type — used only by this mock factory for positioning/sizing.
// NOT stored on SpreadImage; images carry `tags: []` per the new data model.
type MockPlacement = "background" | "character" | "prop" | "foreground" | "raw" | "other";
import { ANIMATION_PRESETS } from "@/constants/playable-constants";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import type { RemixLanguageCode } from "@/types/editor";

// === Helper: Generate UUID ===
function generateUUID(): string {
  return crypto.randomUUID();
}

// === Helper: Random in range ===
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// === Constants ===
const CANVAS_RATIO = 4 / 3;

// Image ratios with picsum dimensions
const IMAGE_RATIOS = [
  { w: 200, h: 300 }, // 2:3 portrait
  { w: 300, h: 300 }, // 1:1 square
  { w: 400, h: 300 }, // 4:3 landscape
  { w: 300, h: 200 }, // 3:2 landscape
];

const TEXTBOX_GEOMETRIES: Geometry[] = [
  { x: 53, y: 65, w: 42, h: 28 },
  { x: 55, y: 10, w: 40, h: 20 },
  { x: 5, y: 70, w: 40, h: 22 },
  { x: 5, y: 5, w: 38, h: 18 },
  { x: 30, y: 80, w: 45, h: 15 },
];

// Image position templates by type
const IMAGE_POSITIONS: Record<MockPlacement, { x: number; y: number }[]> =
  {
    background: [{ x: 0, y: 0 }],
    character: [
      { x: 55, y: 15 },
      { x: 10, y: 20 },
      { x: 35, y: 25 },
      { x: 62, y: 30 },
    ],
    prop: [
      { x: 70, y: 55 },
      { x: 15, y: 60 },
      { x: 42, y: 65 },
      { x: 78, y: 10 },
    ],
    foreground: [
      { x: 0, y: 55 },
      { x: 0, y: 0 },
      { x: 75, y: 0 },
    ],
    raw: [{ x: 20, y: 20 }],
    other: [{ x: 30, y: 30 }],
  };

// Size ranges by image type (base width in %)
const IMAGE_SIZE_RANGES: Record<
  MockPlacement,
  { min: number; max: number }
> = {
  background: { min: 100, max: 100 },
  character: { min: 15, max: 28 },
  prop: { min: 6, max: 15 },
  foreground: { min: 20, max: 100 },
  raw: { min: 20, max: 40 },
  other: { min: 15, max: 30 },
};

// Shape position templates (decorative elements scattered around canvas)
const SHAPE_POSITIONS: Geometry[] = [
  { x: 70, y: 5, w: 20, h: 15 },
  { x: 5, y: 40, w: 25, h: 20 },
  { x: 60, y: 75, w: 18, h: 12 },
  { x: 35, y: 10, w: 22, h: 18 },
  { x: 80, y: 45, w: 15, h: 10 },
];

const SHAPE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
];

// Video position templates (center-ish, like character/prop)
const VIDEO_POSITIONS: Geometry[] = [
  { x: 55, y: 20, w: 28, h: 21 },
  { x: 15, y: 30, w: 30, h: 22 },
  { x: 40, y: 15, w: 25, h: 19 },
];

// Audio position templates (bottom area, small icon-like)
const AUDIO_POSITIONS: Geometry[] = [
  { x: 5, y: 88, w: 10, h: 7 },
  { x: 20, y: 85, w: 8, h: 6 },
  { x: 85, y: 90, w: 10, h: 7 },
];

// Default PLAY duration for mock audio (matches sample-12s.mp3)
const MOCK_AUDIO_DURATION = 12000;

// Z-Index mapping
const Z_INDEX_BY_TYPE: Record<MockPlacement, number> = {
  background: 50,
  character: 125,
  prop: 175,
  foreground: 250,
  raw: 150,
  other: 150,
};

// Track usage indices
let textboxGeoIndex = 0;
const imageGeoIndices: Record<MockPlacement, number> = {
  background: 0,
  character: 0,
  prop: 0,
  foreground: 0,
  raw: 0,
  other: 0,
};

function resetGeometryIndices(): void {
  textboxGeoIndex = 0;
  const keys: MockPlacement[] = [
    "background",
    "character",
    "prop",
    "foreground",
    "raw",
    "other",
  ];
  keys.forEach((k) => (imageGeoIndices[k] = 0));
}

function calcHeightPercent(
  widthPercent: number,
  imgW: number,
  imgH: number
): number {
  const imageRatio = imgW / imgH;
  return Math.round(((widthPercent * CANVAS_RATIO) / imageRatio) * 10) / 10;
}

function clampGeometryToBounds(geo: Geometry): Geometry {
  let { x, y, w, h } = geo;
  w = Math.min(w, 100);
  h = Math.min(h, 100);
  if (x + w > 100) x = Math.max(0, 100 - w);
  if (y + h > 100) y = Math.max(0, 100 - h);
  return { x, y, w, h };
}

// === Animation Helper Functions ===

type EntrancePreset =
  | "appear"
  | "fadeIn"
  | "flyInLeft"
  | "flyInRight"
  | "flyInTop"
  | "flyInBottom"
  | "floatInUp"
  | "floatInDown"
  | "floatInLeft"
  | "zoomIn";
type ExitPreset =
  | "disappear"
  | "fadeOut"
  | "flyOutRight"
  | "flyOutLeft"
  | "flyOutTop"
  | "floatOutUp"
  | "floatOutDown";
type EmphasisPreset =
  | "spin"
  | "spinDouble"
  | "grow"
  | "shrink"
  | "teeter"
  | "transparency";
type MotionPreset = "lineMove" | "arcMove";
type AnimationPreset =
  | EntrancePreset
  | ExitPreset
  | EmphasisPreset
  | MotionPreset;

const ENTRANCE_PRESETS: EntrancePreset[] = [
  "appear",
  "fadeIn",
  "flyInLeft",
  "flyInRight",
  "flyInTop",
  "flyInBottom",
  "floatInUp",
  "floatInDown",
  "floatInLeft",
  "zoomIn",
];
const EXIT_PRESETS: ExitPreset[] = [
  "disappear",
  "fadeOut",
  "flyOutRight",
  "flyOutLeft",
  "flyOutTop",
  "floatOutUp",
  "floatOutDown",
];
const EMPHASIS_PRESETS: EmphasisPreset[] = [
  "spin",
  "spinDouble",
  "grow",
  "shrink",
  "teeter",
  "transparency",
];

function randomEntrance(): EntrancePreset {
  return ENTRANCE_PRESETS[randomBetween(0, ENTRANCE_PRESETS.length - 1)];
}

function randomExit(): ExitPreset {
  return EXIT_PRESETS[randomBetween(0, EXIT_PRESETS.length - 1)];
}

function randomEmphasis(): EmphasisPreset {
  return EMPHASIS_PRESETS[randomBetween(0, EMPHASIS_PRESETS.length - 1)];
}

// Video entrance: exclude zoomIn (effect 6 not in ALLOWED_EFFECTS_BY_TARGET.video)
const VIDEO_ENTRANCE_PRESETS: EntrancePreset[] = [
  "appear",
  "fadeIn",
  "flyInLeft",
  "flyInRight",
  "flyInTop",
  "flyInBottom",
  "floatInUp",
  "floatInDown",
  "floatInLeft",
];

// Video/shape exit: exclude zoom-based exits for safety
const MEDIA_EXIT_PRESETS: ExitPreset[] = [
  "disappear",
  "fadeOut",
  "flyOutRight",
  "flyOutLeft",
  "flyOutTop",
  "floatOutUp",
  "floatOutDown",
];

function randomVideoEntrance(): EntrancePreset {
  return VIDEO_ENTRANCE_PRESETS[
    randomBetween(0, VIDEO_ENTRANCE_PRESETS.length - 1)
  ];
}

function randomMediaExit(): ExitPreset {
  return MEDIA_EXIT_PRESETS[randomBetween(0, MEDIA_EXIT_PRESETS.length - 1)];
}

/** Create a PLAY animation directly (no preset lookup — ANIMATION_PRESETS has no 'play' key) */
function createPlayAnimation(
  order: number,
  targetId: string,
  targetType: SpreadAnimation["target"]["type"],
  triggerType: SpreadAnimation["trigger_type"] = "after_previous",
  duration = 10000
): SpreadAnimation {
  return {
    order,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: triggerType,
    effect: { type: EFFECT_TYPE.PLAY, duration },
  };
}

/** Create a SpreadAnimation from a preset key */
function createAnimation(
  order: number,
  targetId: string,
  targetType: SpreadAnimation["target"]["type"],
  preset: AnimationPreset,
  triggerType: SpreadAnimation["trigger_type"] = "after_previous",
  overrides: Partial<SpreadAnimation["effect"]> = {}
): SpreadAnimation {
  const presetData = ANIMATION_PRESETS[preset];
  return {
    order,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: triggerType,
    effect: { ...presetData, ...overrides },
  };
}

// Slow mock durations (2–5s) so animations are easy to follow in the demo
function mockDuration(): number {
  return randomBetween(2000, 5000);
}

/**
 * Generate animation sequence using Fade In/Out and Fly In/Out.
 *
 * Randomly picks entrance (fadeIn, flyIn*) and exit (fadeOut, flyOut*) presets
 * to cover all animation types for testing.
 *
 * Covers all trigger types:
 *   - auto: background entrance on spread load
 *   - on_next: characters, textboxes, props entrance
 *   - on_click: character exit (interactive)
 *   - after_previous / with_previous: chained animations
 *   - exit: textboxes and characters exit
 */
function generateSpreadAnimations(
  images: SpreadImage[],
  textboxes: SpreadTextbox[],
  placements: Map<string, MockPlacement>,
  shapes: SpreadShape[] = [],
  videos: SpreadVideo[] = [],
  audios: SpreadAudio[] = [],
  quizzes: SpreadQuiz[] = []
): SpreadAnimation[] {
  const animations: SpreadAnimation[] = [];
  let order = 0;

  const bgImages = images.filter((img) => placements.get(img.id) === "background");
  const characterImages = images.filter((img) => placements.get(img.id) === "character");
  const propImages = images.filter((img) => placements.get(img.id) === "prop");
  const otherImages = images.filter(
    (img) => !["background", "character", "prop"].includes(placements.get(img.id) ?? "")
  );

  // ── Auto: background entrance on spread load ──
  bgImages.forEach((bg) => {
    animations.push(
      createAnimation(
        order++,
        bg.id,
        "image",
        randomEntrance(),
        order === 1 ? "after_previous" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: characters entrance (first triggers step, rest with_previous) ──
  characterImages.forEach((char, i) => {
    animations.push(
      createAnimation(
        order++,
        char.id,
        "image",
        randomEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration(), delay: i * 500 }
      )
    );
  });

  // ── on_next: textboxes entrance (sequential via after_previous) ──
  textboxes.forEach((tb, i) => {
    animations.push(
      createAnimation(
        order++,
        tb.id,
        "textbox",
        randomEntrance(),
        i === 0 ? "on_next" : "after_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: props entrance ──
  propImages.forEach((prop, i) => {
    animations.push(
      createAnimation(
        order++,
        prop.id,
        "image",
        randomEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: shapes entrance (entrance only, no emphasis — decorative) ──
  shapes.forEach((shape, i) => {
    animations.push(
      createAnimation(
        order++,
        shape.id,
        "shape",
        randomEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: videos entrance (exclude zoomIn) + PLAY after entrance ──
  videos.forEach((video, i) => {
    animations.push(
      createAnimation(
        order++,
        video.id,
        "video",
        randomVideoEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
    // PLAY runs after entrance completes — video only plays when 100% visible
    animations.push(
      createPlayAnimation(order++, video.id, "video", "after_previous")
    );
  });

  // ── audios: entrance → PLAY (duration = audio length) → exit ──
  audios.forEach((audio, i) => {
    animations.push(
      createAnimation(
        order++,
        audio.id,
        "audio",
        randomEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
    animations.push(
      createPlayAnimation(
        order++,
        audio.id,
        "audio",
        "after_previous",
        MOCK_AUDIO_DURATION
      )
    );
    animations.push(
      createAnimation(
        order++,
        audio.id,
        "audio",
        randomMediaExit(),
        "after_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: quizzes PLAY (pause timeline, open modal) ──
  quizzes.forEach((quiz, i) => {
    animations.push(
      createPlayAnimation(
        order++,
        quiz.id,
        "quiz",
        i === 0 ? "on_next" : "with_previous"
      )
    );
  });

  // ── on_click: emphasis on characters (spin/grow/shrink/teeter/transparency) ──
  characterImages.forEach((char, i) => {
    const preset = randomEmphasis();
    const overrides: Partial<SpreadAnimation["effect"]> = { duration: mockDuration() };
    if (preset === "grow") overrides.amount = 1.5;
    if (preset === "shrink") overrides.amount = 0.6;
    if (preset === "transparency") overrides.amount = 0.3;
    const anim = createAnimation(
      order++,
      char.id,
      "image",
      preset,
      i === 0 ? "on_click" : "with_previous",
      overrides
    );
    anim.click_loop = randomBetween(3, 5);
    animations.push(anim);
  });

  // ── on_click: Lines motion on first prop ──
  if (propImages.length > 0) {
    const target = propImages[0];
    const destX = randomBetween(10, 70);
    const destY = randomBetween(10, 70);
    const anim = createAnimation(
      order++,
      target.id,
      "image",
      "lineMove",
      "on_click",
      {
        duration: mockDuration(),
        geometry: {
          x: destX,
          y: destY,
          w: target.geometry.w,
          h: target.geometry.h,
        },
      }
    );
    anim.click_loop = randomBetween(3, 5);
    animations.push(anim);
  }

  // ── on_next: textboxes exit ──
  textboxes.forEach((tb, i) => {
    animations.push(
      createAnimation(
        order++,
        tb.id,
        "textbox",
        randomExit(),
        i === 0 ? "on_next" : "after_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: remaining characters exit ──
  characterImages.slice(1).forEach((char, i) => {
    animations.push(
      createAnimation(
        order++,
        char.id,
        "image",
        randomExit(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: shapes exit ──
  shapes.forEach((shape, i) => {
    animations.push(
      createAnimation(
        order++,
        shape.id,
        "shape",
        randomMediaExit(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: videos exit ──
  videos.forEach((video, i) => {
    animations.push(
      createAnimation(
        order++,
        video.id,
        "video",
        randomMediaExit(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  // ── on_next: other images entrance ──
  otherImages.forEach((img, i) => {
    animations.push(
      createAnimation(
        order++,
        img.id,
        "image",
        randomEntrance(),
        i === 0 ? "on_next" : "with_previous",
        { duration: mockDuration() }
      )
    );
  });

  return animations;
}

function getTextboxGeometry(): Geometry {
  const geo = TEXTBOX_GEOMETRIES[textboxGeoIndex % TEXTBOX_GEOMETRIES.length];
  textboxGeoIndex++;
  return clampGeometryToBounds({ ...geo });
}

const BACKGROUND_RATIO_DPS = { w: 400, h: 300 };
const BACKGROUND_RATIO_SINGLE = { w: 200, h: 300 };

interface ImageWithGeometry {
  geometry: Geometry;
  dimensions: { w: number; h: number };
}

function getRandomImageGeometry(
  type: MockPlacement,
  isDPS = true
): ImageWithGeometry {
  const positions = IMAGE_POSITIONS[type] || IMAGE_POSITIONS.other;
  const sizeRange = IMAGE_SIZE_RANGES[type] || IMAGE_SIZE_RANGES.other;

  const idx = imageGeoIndices[type] % positions.length;
  imageGeoIndices[type]++;

  const pos = positions[idx];

  const ratio =
    type === "background"
      ? isDPS
        ? BACKGROUND_RATIO_DPS
        : BACKGROUND_RATIO_SINGLE
      : IMAGE_RATIOS[randomBetween(0, IMAGE_RATIOS.length - 1)];

  const baseW = randomBetween(sizeRange.min, sizeRange.max);
  const h = calcHeightPercent(baseW, ratio.w, ratio.h);

  return {
    geometry: clampGeometryToBounds({ x: pos.x, y: pos.y, w: baseW, h }),
    dimensions: ratio,
  };
}

// === Sample Text Content ===
const SAMPLE_TEXTS = {
  en_US: [
    "Once upon a time, in a faraway land, there lived a little cat named Miu.",
    "The sun was shining brightly as Miu decided to explore the garden.",
    "Along the way, Miu met a friendly butterfly with colorful wings.",
    "Together they discovered a hidden pond filled with golden fish.",
    "And so, Miu learned that the best adventures are shared with friends.",
    "The little cat smiled, knowing tomorrow would bring new discoveries.",
  ],
  vi_VN: [
    "Ngày xửa ngày xưa, trong một vùng đất xa xôi, có một chú mèo nhỏ tên là Miu.",
    "Mặt trời chiếu sáng rực rỡ khi Miu quyết định khám phá khu vườn.",
    "Trên đường đi, Miu gặp một chú bướm thân thiện với đôi cánh rực rỡ.",
    "Cùng nhau họ khám phá ra một hồ nước ẩn chứa đầy cá vàng.",
    "Và thế là Miu học được rằng những cuộc phiêu lưu tuyệt vời nhất là khi có bạn đồng hành.",
    "Chú mèo nhỏ mỉm cười, biết rằng ngày mai sẽ mang đến những khám phá mới.",
  ],
};

const defaultTypography: Typography = {
  size: 16,
  weight: 400,
  style: "normal",
  family: "Nunito",
  color: "#000000",
  lineHeight: 1.5,
  letterSpacing: 0,
  decoration: "none",
  textAlign: "left",
  textTransform: "none",
};

function createMockPage(
  pageNumber: number | string,
  type: PageData["type"] = "normal_page"
): PageData {
  return {
    number: pageNumber,
    type,
    layout: null,
    background: {
      color: "#FFFFFF",
      texture: null,
    },
  };
}

function createMockTextbox(
  language = "en_US",
  overrides: Partial<SpreadTextbox> = {}
): SpreadTextbox {
  const texts =
    SAMPLE_TEXTS[language as keyof typeof SAMPLE_TEXTS] || SAMPLE_TEXTS.en_US;
  const text = texts[randomBetween(0, texts.length - 1)];

  return {
    id: generateUUID(),
    title: `Textbox ${randomBetween(1, 100)}`,
    [language]: {
      text,
      geometry: getTextboxGeometry(),
      typography: { ...defaultTypography },
    },
    ...overrides,
  };
}

// Weighted type distribution for images
const IMAGE_TYPE_WEIGHTS: { type: MockPlacement; weight: number }[] = [
  { type: "character", weight: 40 },
  { type: "prop", weight: 40 },
  { type: "background", weight: 10 },
  { type: "foreground", weight: 10 },
];

function getWeightedRandomType(): MockPlacement {
  const totalWeight = IMAGE_TYPE_WEIGHTS.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of IMAGE_TYPE_WEIGHTS) {
    random -= item.weight;
    if (random <= 0) return item.type;
  }
  return "prop";
}

interface MockImageResult {
  image: SpreadImage;
  placement: MockPlacement;
}

// Create SpreadImage with retouch fields; returns image + internal placement for animation grouping.
// Placement is NOT stored on the image — images carry `tags: []` per the new data model.
function createMockImage(
  overrides: Partial<SpreadImage> = {},
  isDPS = true
): MockImageResult {
  const placement: MockPlacement = getWeightedRandomType();
  const { geometry, dimensions } = getRandomImageGeometry(placement, isDPS);

  const image: SpreadImage = {
    id: generateUUID(),
    title: `Image ${randomBetween(1, 100)}`,
    geometry,
    media_url: `https://picsum.photos/seed/${generateUUID()}/${dimensions.w}/${
      dimensions.h
    }`,
    "z-index": Z_INDEX_BY_TYPE[placement],
    player_visible: true,
    editor_visible: true,
    tags: [],
    ...overrides,
  };
  return { image, placement };
}

// === Shape / Video / Audio Mock Creators ===

function createMockShape(overrides: Partial<SpreadShape> = {}): SpreadShape {
  const pos = SHAPE_POSITIONS[randomBetween(0, SHAPE_POSITIONS.length - 1)];
  const color = SHAPE_COLORS[randomBetween(0, SHAPE_COLORS.length - 1)];
  return {
    id: generateUUID(),
    type: "rectangle",
    title: `Shape ${randomBetween(1, 100)}`,
    geometry: clampGeometryToBounds({ ...pos }),
    fill: { is_filled: true, color, opacity: randomBetween(70, 100) / 100 },
    outline: {
      color: "#333333",
      width: randomBetween(1, 3),
      radius: randomBetween(0, 8),
      type: 0,
    },
    player_visible: true,
    editor_visible: true,
    ...overrides,
  };
}

function createMockVideo(overrides: Partial<SpreadVideo> = {}): SpreadVideo {
  const pos = VIDEO_POSITIONS[randomBetween(0, VIDEO_POSITIONS.length - 1)];
  return {
    id: generateUUID(),
    title: `Video ${randomBetween(1, 100)}`,
    geometry: clampGeometryToBounds({ ...pos }),
    "z-index": 200,
    player_visible: true,
    editor_visible: true,
    tags: [],
    media_url: "https://www.w3schools.com/tags/mov_bbb.mp4",
    ...overrides,
  };
}

function createMockAudio(overrides: Partial<SpreadAudio> = {}): SpreadAudio {
  const pos = AUDIO_POSITIONS[randomBetween(0, AUDIO_POSITIONS.length - 1)];
  return {
    id: generateUUID(),
    title: `Audio ${randomBetween(1, 100)}`,
    geometry: clampGeometryToBounds({ ...pos }),
    "z-index": 300,
    player_visible: true,
    editor_visible: true,
    tags: [],
    media_url: "https://download.samplelib.com/mp3/sample-12s.mp3",
    ...overrides,
  };
}

// === Quiz Mock Creators ===
// Removed in Quiz v2 migration [2026-04-11]. Demo spreads now render without
// quizzes; player UI cho 5 quiz types sẽ được design lại sau.

// === Factory Options ===
export interface CreatePlayableSpreadOptions {
  spreadCount: number;
  textboxCount: number;
  imageCount: number;
  shapeCount: number;
  videoProbability: number;
  audioCount: number;
  // App's 5 supported languages; ja/ko/zh fall back to English mock text in this factory.
  language: RemixLanguageCode;
  isDPS?: boolean;
}

// === Create Multiple Playable Spreads ===
export function createPlayableSpreads(
  options: CreatePlayableSpreadOptions
): PlayableSpread[] {
  const {
    spreadCount,
    textboxCount,
    imageCount,
    shapeCount,
    videoProbability,
    audioCount,
    language,
    isDPS = true,
  } = options;
  resetGeometryIndices();

  return Array.from({ length: spreadCount }, (_, spreadIndex) => {
    const leftPageNum = spreadIndex * 2;
    const rightPageNum = leftPageNum + 1;

    const pages: PageData[] = isDPS
      ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
      : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

    const textboxes: SpreadTextbox[] = Array.from(
      { length: textboxCount },
      () => createMockTextbox(language)
    );

    // Build images + a placement map for animation grouping.
    // Placement (background/character/prop/…) is internal to the mock factory —
    // it is NOT stored on SpreadImage (images carry `tags: []`).
    const imageResults = Array.from({ length: imageCount }, () =>
      createMockImage({}, isDPS)
    );
    const images: SpreadImage[] = imageResults.map((r) => r.image);
    const placements = new Map<string, MockPlacement>(
      imageResults.map((r) => [r.image.id, r.placement])
    );

    const shapes: SpreadShape[] = Array.from({ length: shapeCount }, () =>
      createMockShape()
    );
    const videos: SpreadVideo[] =
      Math.random() < videoProbability ? [createMockVideo()] : [];
    const audios: SpreadAudio[] = Array.from({ length: audioCount }, () =>
      createMockAudio()
    );

    // Quiz: mocks disabled during Quiz v2 migration — demo spreads render without quizzes
    const quizzes: SpreadQuiz[] = [];

    const animations = generateSpreadAnimations(
      images,
      textboxes,
      placements,
      shapes,
      videos,
      audios,
      quizzes
    );

    const spread: PlayableSpread = {
      id: generateUUID(),
      pages,
      images,
      textboxes,
      shapes,
      videos,
      audios,
      quizzes,
      animations,
      manuscript:
        SAMPLE_TEXTS[language as keyof typeof SAMPLE_TEXTS]?.[spreadIndex % 6] || "",
    };

    return spread;
  });
}

export default {
  createPlayableSpreads,
};
