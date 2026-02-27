// __mocks__/spread-factory.ts - Mock data factory for BaseSpread objects

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadObject,
  PageData,
  Geometry,
  Typography,
} from '@/components/canvas-spread-view';

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

// Available object ratios with picsum dimensions
const OBJECT_RATIOS = [
  { w: 200, h: 300 },  // 2:3 portrait (character)
  { w: 300, h: 300 },  // 1:1 square (prop)
  { w: 400, h: 300 },  // 4:3 landscape (background)
  { w: 200, h: 400 },  // 1:2 tall portrait
  { w: 300, h: 200 },  // 3:2 landscape
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

// Object position templates by type
const OBJECT_POSITIONS: Record<string, { x: number; y: number }[]> = {
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
};

// Size ranges by object type (base width in %)
const OBJECT_SIZE_RANGES: Record<string, { min: number; max: number }> = {
  background: { min: 100, max: 100 },
  character: { min: 15, max: 28 },
  prop: { min: 6, max: 15 },
  foreground: { min: 20, max: 100 },
};

// Track usage indices
let imageGeoIndex = 0;
let textboxGeoIndex = 0;
const objectGeoIndices: Record<string, number> = {
  background: 0, character: 0, prop: 0, foreground: 0, raw: 0, other: 0,
};

export function resetGeometryIndices(): void {
  imageGeoIndex = 0;
  textboxGeoIndex = 0;
  Object.keys(objectGeoIndices).forEach(k => objectGeoIndices[k] = 0);
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

// Fixed background ratios
const BACKGROUND_RATIO_DPS = { w: 400, h: 300 };   // 4:3 landscape for DPS
const BACKGROUND_RATIO_SINGLE = { w: 200, h: 300 }; // 2:3 portrait for non-DPS

// Get random object with geometry matching its ratio
interface ObjectWithGeometry {
  geometry: Geometry;
  dimensions: { w: number; h: number };
}

function getRandomObjectGeometry(type: string, isDPS = true): ObjectWithGeometry {
  const typeKey = type in objectGeoIndices ? type : 'other';
  const positions = OBJECT_POSITIONS[typeKey] || OBJECT_POSITIONS.prop;
  const sizeRange = OBJECT_SIZE_RANGES[typeKey] || OBJECT_SIZE_RANGES.prop;

  const idx = objectGeoIndices[typeKey] % positions.length;
  objectGeoIndices[typeKey]++;

  const pos = positions[idx];

  // Background uses fixed ratio based on DPS/non-DPS
  const ratio = type === 'background'
    ? (isDPS ? BACKGROUND_RATIO_DPS : BACKGROUND_RATIO_SINGLE)
    : OBJECT_RATIOS[randomBetween(0, OBJECT_RATIOS.length - 1)];

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

// === Create Single Image ===
export function createMockImage(overrides: Partial<SpreadImage> = {}): SpreadImage {
  const artNoteIdx = randomBetween(0, ART_NOTES.length - 1);
  const { geometry, dimensions } = getRandomImageGeometry();

  return {
    id: generateUUID(),
    title: `Image ${randomBetween(1, 100)}`,
    geometry,
    art_note: ART_NOTES[artNoteIdx],
    visual_description: ART_NOTES[artNoteIdx],
    image_references: [],
    sketches: [],
    illustrations: [
      {
        media_url: `https://picsum.photos/seed/${generateUUID()}/${dimensions.w}/${dimensions.h}`,
        created_time: new Date().toISOString(),
        is_selected: true,
      },
    ],
    ...overrides,
  };
}

// === Create Single Object ===
const OBJECT_TYPES: SpreadObject['type'][] = ['character', 'prop', 'background', 'foreground'];
const OBJECT_NAMES = ['main_character', 'side_character', 'prop_1', 'background_1'];
const OBJECT_STATES: Record<string, string[]> = {
  main_character: ['default', 'happy', 'sad'],
  side_character: ['default', 'talking'],
  prop_1: ['default'],
  background_1: ['day', 'night'],
};

export function createMockObject(
  overrides: Partial<SpreadObject> = {},
  isDPS = true
): SpreadObject {
  const typeIndex = randomBetween(0, OBJECT_TYPES.length - 1);
  const type = OBJECT_TYPES[typeIndex];
  const name = OBJECT_NAMES[typeIndex] || 'unnamed';
  const states = OBJECT_STATES[name] || ['default'];
  const state = states[randomBetween(0, states.length - 1)];

  const zIndexMap: Record<SpreadObject['type'], number> = {
    background: 50,
    character: 125,
    prop: 175,
    foreground: 250,
    raw: 150,
    other: 150,
  };

  const { geometry, dimensions } = getRandomObjectGeometry(type, isDPS);

  return {
    id: generateUUID(),
    name,
    state,
    type,
    media_url: `https://picsum.photos/seed/${generateUUID()}/${dimensions.w}/${dimensions.h}`,
    media_type: 'image',
    geometry,
    zIndex: zIndexMap[type],
    player_visible: true,
    editor_visible: true,
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
      fill: { color: '#ffffff', opacity: 0 },
      outline: { color: '#000000', width: 0, radius: 0, type: 'solid' },
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
  objectCount?: number;
  language?: string;
  withGeneratedImages?: boolean;
}

export function createMockSpread(options: CreateSpreadOptions = {}): BaseSpread {
  const {
    spreadIndex = 0,
    isDPS = true,
    imageCount = 1,
    textboxCount = 1,
    objectCount = 0,
    language = 'en_US',
    withGeneratedImages = false,
  } = options;

  const leftPageNum = spreadIndex * 2;
  const rightPageNum = leftPageNum + 1;

  // Create pages
  const pages: PageData[] = isDPS
    ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
    : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

  // Create images with random ratios (illustrations always included with matching dimensions)
  const images: SpreadImage[] = Array.from({ length: imageCount }, () =>
    createMockImage(withGeneratedImages ? {} : { illustrations: [] })
  );

  // Create textboxes
  const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
    createMockTextbox(language)
  );

  // Create objects (pass isDPS for background ratio)
  const objects: SpreadObject[] = Array.from({ length: objectCount }, () =>
    createMockObject({}, isDPS)
  );

  return {
    id: generateUUID(),
    pages,
    images,
    textboxes,
    objects,
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
  createMockObject,
  createMockPage,
  createMockSpread,
  createMockSpreads,
};
