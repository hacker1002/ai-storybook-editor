// __mocks__/spread-factory.ts - Mock data factory for BaseSpread objects

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  PageData,
  Geometry,
  Typography,
  ShapeFill,
  ShapeOutline,
} from '@/features/editor/components/canvas-spread-view';

// === Helper: Generate UUID ===
function generateUUID(): string {
  return crypto.randomUUID();
}

// === Helper: Random in range ===
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// === Constants ===
const CANVAS_RATIO = 4 / 3; // Canvas aspect ratio (800x600)

// Available image ratios with picsum dimensions
const IMAGE_RATIOS = [
  { w: 400, h: 300 },  // 4:3 landscape
  { w: 300, h: 400 },  // 3:4 portrait
  { w: 400, h: 400 },  // 1:1 square
  { w: 480, h: 270 },  // 16:9 wide
  { w: 300, h: 200 },  // 3:2 landscape
];

// Shape preset geometries
const SHAPE_GEOMETRIES: Geometry[] = [
  { x: 60, y: 10, w: 30, h: 25 },
  { x: 5, y: 60, w: 25, h: 30 },
  { x: 40, y: 40, w: 20, h: 20 },
  { x: 70, y: 70, w: 25, h: 20 },
];

// Position templates (x, y only - w/h calculated from ratio)
const IMAGE_POSITIONS = [
  { x: 3, y: 5 },    // Top-left
  { x: 5, y: 45 },   // Bottom-left
  { x: 52, y: 5 },   // Top-right
  { x: 50, y: 50 },  // Bottom-right
  { x: 8, y: 20 },   // Left center
];

const TEXTBOX_GEOMETRIES: Geometry[] = [
  { x: 53, y: 65, w: 42, h: 28 },
  { x: 55, y: 10, w: 40, h: 20 },
  { x: 5, y: 70, w: 40, h: 22 },
  { x: 5, y: 5, w: 38, h: 18 },
  { x: 30, y: 80, w: 45, h: 15 },
];

// Video/Audio preset geometries
const MEDIA_GEOMETRIES: Geometry[] = [
  { x: 5, y: 5, w: 20, h: 15 },
  { x: 75, y: 5, w: 20, h: 15 },
  { x: 5, y: 80, w: 15, h: 12 },
  { x: 80, y: 80, w: 15, h: 12 },
];

// Track usage indices
let imageGeoIndex = 0;
let textboxGeoIndex = 0;
let shapeGeoIndex = 0;
let mediaGeoIndex = 0;

export function resetGeometryIndices(): void {
  imageGeoIndex = 0;
  textboxGeoIndex = 0;
  shapeGeoIndex = 0;
  mediaGeoIndex = 0;
}

// Calculate h% from w% to match image ratio on canvas
// Formula: displayedRatio = (w%/h%) * canvasRatio
// So: h% = w% * canvasRatio / imageRatio
function calcHeightPercent(widthPercent: number, imgW: number, imgH: number): number {
  const imageRatio = imgW / imgH;
  return Math.round(widthPercent * CANVAS_RATIO / imageRatio * 10) / 10;
}

// Clamp geometry to stay within canvas bounds (x+w <= 100, y+h <= 100)
function clampGeometryToBounds(geo: Geometry): Geometry {
  let { x, y, w, h } = geo;

  // Ensure w and h don't exceed 100%
  w = Math.min(w, 100);
  h = Math.min(h, 100);

  // Clamp x so x+w <= 100
  if (x + w > 100) {
    x = Math.max(0, 100 - w);
  }

  // Clamp y so y+h <= 100
  if (y + h > 100) {
    y = Math.max(0, 100 - h);
  }

  return { x, y, w, h };
}

// Get random image with geometry matching its ratio
interface ImageWithGeometry {
  geometry: Geometry;
  dimensions: { w: number; h: number };
}

function getRandomImageGeometry(): ImageWithGeometry {
  const ratio = IMAGE_RATIOS[randomBetween(0, IMAGE_RATIOS.length - 1)];
  const pos = IMAGE_POSITIONS[imageGeoIndex % IMAGE_POSITIONS.length];
  imageGeoIndex++;

  const baseW = randomBetween(28, 42);
  const h = calcHeightPercent(baseW, ratio.w, ratio.h);

  return {
    geometry: clampGeometryToBounds({ x: pos.x, y: pos.y, w: baseW, h }),
    dimensions: ratio,
  };
}

function getTextboxGeometry(): Geometry {
  const geo = TEXTBOX_GEOMETRIES[textboxGeoIndex % TEXTBOX_GEOMETRIES.length];
  textboxGeoIndex++;
  return clampGeometryToBounds({ ...geo });
}

function getShapeGeometry(): Geometry {
  const geo = SHAPE_GEOMETRIES[shapeGeoIndex % SHAPE_GEOMETRIES.length];
  shapeGeoIndex++;
  return clampGeometryToBounds({ ...geo });
}

function getMediaGeometry(): Geometry {
  const geo = MEDIA_GEOMETRIES[mediaGeoIndex % MEDIA_GEOMETRIES.length];
  mediaGeoIndex++;
  return clampGeometryToBounds({ ...geo });
}

// === Sample Text Content ===
const SAMPLE_TEXTS = {
  en_US: [
    'Once upon a time, in a faraway land, there lived a little cat named Miu.',
    'The sun was shining brightly as Miu decided to explore the garden.',
    'Along the way, Miu met a friendly butterfly with colorful wings.',
    'Together they discovered a hidden pond filled with golden fish.',
    'And so, Miu learned that the best adventures are shared with friends.',
    'The little cat smiled, knowing tomorrow would bring new discoveries.',
  ],
  vi_VN: [
    'Ngày xửa ngày xưa, trong một vùng đất xa xôi, có một chú mèo nhỏ tên là Miu.',
    'Mặt trời chiếu sáng rực rỡ khi Miu quyết định khám phá khu vườn.',
    'Trên đường đi, Miu gặp một chú bướm thân thiện với đôi cánh rực rỡ.',
    'Cùng nhau họ khám phá ra một hồ nước ẩn chứa đầy cá vàng.',
    'Và thế là Miu học được rằng những cuộc phiêu lưu tuyệt vời nhất là khi có bạn đồng hành.',
    'Chú mèo nhỏ mỉm cười, biết rằng ngày mai sẽ mang đến những khám phá mới.',
  ],
};

const ART_NOTES = [
  'A fluffy orange cat sitting on a windowsill, looking outside with curious eyes.',
  'Golden morning light streaming through leaves, creating dappled shadows.',
  'A colorful butterfly with blue and orange wings, hovering near flowers.',
  'A serene pond surrounded by willow trees, reflecting the sky.',
  'Two small friends walking along a garden path, holding hands.',
  'A cozy cottage in the distance, smoke rising from the chimney.',
];

// === Default Typography ===
const defaultTypography: Typography = {
  size: 16,
  weight: 400,
  style: 'normal',
  family: 'Nunito',
  color: '#000000',
  lineHeight: 1.5,
  letterSpacing: 0,
  decoration: 'none',
  textAlign: 'left',
  textTransform: 'none',
};

// === Generate Illustrations Helper ===
/**
 * Generates multiple illustrations with decreasing timestamps
 * @param count - Number of illustrations to generate
 * @param dimensions - Image dimensions for picsum URLs
 * @returns Array of illustrations with newest first, only first is selected
 */
function generateIllustrations(
  count: number,
  dimensions: { w: number; h: number }
): Array<{ media_url: string; created_time: string; is_selected: boolean }> {
  const now = new Date();
  const illustrations = [];

  for (let i = 0; i < count; i++) {
    // Subtract hours from current time to create history (newest first)
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // 1 hour intervals

    illustrations.push({
      media_url: `https://picsum.photos/seed/${generateUUID()}/${dimensions.w}/${dimensions.h}`,
      created_time: timestamp.toISOString(),
      is_selected: i === 0, // Only first (newest) illustration is selected
    });
  }

  return illustrations;
}

// === Create Single Image ===
export interface CreateMockImageOptions {
  withGeneratedImages?: boolean;
  illustrationCount?: number;
  overrides?: Partial<SpreadImage>;
}

export function createMockImage(
  options: CreateMockImageOptions | Partial<SpreadImage> = {}
): SpreadImage {
  // Support backward compatibility: if options doesn't have withGeneratedImages, treat as overrides
  const isLegacyCall = !('withGeneratedImages' in options);
  const withGeneratedImages = isLegacyCall ? true : options.withGeneratedImages ?? true;
  const illustrationCount = isLegacyCall ? undefined : (options as CreateMockImageOptions).illustrationCount;
  const overrides = isLegacyCall ? (options as Partial<SpreadImage>) : (options as CreateMockImageOptions).overrides ?? {};

  const artNoteIdx = randomBetween(0, ART_NOTES.length - 1);
  const { geometry, dimensions } = getRandomImageGeometry();

  // Generate illustrations based on withGeneratedImages flag
  const illustrations = withGeneratedImages
    ? generateIllustrations(
        illustrationCount ?? randomBetween(3, 5), // Random 3-5 if not specified
        dimensions
      )
    : [];

  return {
    id: generateUUID(),
    title: `Image ${randomBetween(1, 100)}`,
    geometry,
    art_note: ART_NOTES[artNoteIdx],
    visual_description: ART_NOTES[artNoteIdx],
    image_references: [],
    illustrations,
    ...overrides,
  };
}

// === Shape fill/outline colors ===
const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

// === Create Single Shape ===
export function createMockShape(overrides: Partial<SpreadShape> = {}): SpreadShape {
  const color = SHAPE_COLORS[randomBetween(0, SHAPE_COLORS.length - 1)];
  const outlineColor = SHAPE_COLORS[randomBetween(0, SHAPE_COLORS.length - 1)];

  const fill: ShapeFill = {
    is_filled: Math.random() > 0.3,
    color,
    opacity: 0.5 + Math.random() * 0.5,
  };

  const outline: ShapeOutline = {
    color: outlineColor,
    width: randomBetween(1, 3),
    radius: randomBetween(0, 10),
    type: randomBetween(0, 2) as 0 | 1 | 2,
  };

  return {
    id: generateUUID(),
    type: 'rectangle',
    title: `Shape ${randomBetween(1, 100)}`,
    geometry: getShapeGeometry(),
    fill,
    outline,
    player_visible: true,
    editor_visible: true,
    ...overrides,
  };
}

// === Create Single Video ===
export function createMockVideo(overrides: Partial<SpreadVideo> = {}): SpreadVideo {
  const names = ['intro_video', 'scene_transition', 'character_action', 'ambient_clip'];
  const name = names[randomBetween(0, names.length - 1)];

  return {
    id: generateUUID(),
    title: `Video ${randomBetween(1, 100)}`,
    geometry: getMediaGeometry(),
    'z-index': 100 + randomBetween(0, 50),
    player_visible: true,
    editor_visible: true,
    name,
    type: 'other',
    media_url: undefined, // Placeholder - renders icon
    ...overrides,
  };
}

// === Create Single Audio ===
export function createMockAudio(overrides: Partial<SpreadAudio> = {}): SpreadAudio {
  const names = ['bgm_track', 'sfx_click', 'narration', 'ambient_sound'];
  const name = names[randomBetween(0, names.length - 1)];

  return {
    id: generateUUID(),
    title: `Audio ${randomBetween(1, 100)}`,
    geometry: getMediaGeometry(),
    'z-index': 50 + randomBetween(0, 25),
    player_visible: true,
    editor_visible: true,
    name,
    type: 'other',
    media_url: undefined, // Placeholder - renders icon
    ...overrides,
  };
}

// === Create Single Textbox ===
export function createMockTextbox(
  language = 'en_US',
  overrides: Partial<SpreadTextbox> = {}
): SpreadTextbox {
  const texts = SAMPLE_TEXTS[language as keyof typeof SAMPLE_TEXTS] || SAMPLE_TEXTS.en_US;
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

// === Create Page Data ===
export function createMockPage(
  pageNumber: number | string,
  type: PageData['type'] = 'normal_page'
): PageData {
  return {
    number: pageNumber,
    type,
    layout: null,
    background: {
      color: '#FFFFFF',
      texture: null,
    },
  };
}

// === Create Single Spread ===
export interface CreateSpreadOptions {
  spreadIndex?: number;
  isDPS?: boolean;
  imageCount?: number;
  textboxCount?: number;
  shapeCount?: number;
  videoCount?: number;
  audioCount?: number;
  language?: string;
  withGeneratedImages?: boolean;
}

export function createMockSpread(options: CreateSpreadOptions = {}): BaseSpread {
  const {
    spreadIndex = 0,
    isDPS = true,
    imageCount = 1,
    textboxCount = 1,
    shapeCount = 0,
    videoCount = 0,
    audioCount = 0,
    language = 'en_US',
    withGeneratedImages = false,
  } = options;

  const leftPageNum = spreadIndex * 2;
  const rightPageNum = leftPageNum + 1;

  // Create pages
  const pages: PageData[] = isDPS
    ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
    : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

  // Create images with random ratios (illustrations based on withGeneratedImages flag)
  const images: SpreadImage[] = Array.from({ length: imageCount }, () =>
    createMockImage({ withGeneratedImages })
  );

  // Create textboxes
  const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
    createMockTextbox(language)
  );

  // Create shapes
  const shapes: SpreadShape[] = Array.from({ length: shapeCount }, () =>
    createMockShape()
  );

  // Create videos
  const videos: SpreadVideo[] = Array.from({ length: videoCount }, () =>
    createMockVideo()
  );

  // Create audios
  const audios: SpreadAudio[] = Array.from({ length: audioCount }, () =>
    createMockAudio()
  );

  return {
    id: generateUUID(),
    pages,
    images,
    textboxes,
    shapes,
    videos,
    audios,
    animations: [],
    manuscript: SAMPLE_TEXTS[language as keyof typeof SAMPLE_TEXTS]?.[spreadIndex % 6] || '',
  };
}

// === Create Multiple Spreads ===
export function createMockSpreads(
  count: number,
  options: Omit<CreateSpreadOptions, 'spreadIndex'> = {}
): BaseSpread[] {
  resetGeometryIndices();
  return Array.from({ length: count }, (_, i) =>
    createMockSpread({ ...options, spreadIndex: i })
  );
}

export default {
  createMockImage,
  createMockTextbox,
  createMockShape,
  createMockVideo,
  createMockAudio,
  createMockPage,
  createMockSpread,
  createMockSpreads,
};
