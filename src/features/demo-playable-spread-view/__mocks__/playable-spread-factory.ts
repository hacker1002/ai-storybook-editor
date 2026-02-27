// __mocks__/playable-spread-factory.ts - Mock factory for PlayableSpread data

import type {
  PlayableSpread,
  Animation,
} from '@/components/playable-spread-view/types';
import type {
  PageData,
  SpreadTextbox,
  SpreadObject,
  Geometry,
  Typography,
} from '@/components/canvas-spread-view/types';

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

// Available object ratios with picsum dimensions
const OBJECT_RATIOS = [
  { w: 200, h: 300 },  // 2:3 portrait (character)
  { w: 300, h: 300 },  // 1:1 square (prop)
  { w: 400, h: 300 },  // 4:3 landscape (background)
  { w: 200, h: 400 },  // 1:2 tall portrait
  { w: 300, h: 200 },  // 3:2 landscape
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
let textboxGeoIndex = 0;
const objectGeoIndices: Record<string, number> = {
  background: 0, character: 0, prop: 0, foreground: 0, raw: 0, other: 0,
};

function resetGeometryIndices(): void {
  textboxGeoIndex = 0;
  Object.keys(objectGeoIndices).forEach(k => objectGeoIndices[k] = 0);
}

// Calculate h% from w% to match image ratio on canvas
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

// === Create Page Data ===
function createMockPage(
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

// === Create Single Textbox ===
function createMockTextbox(
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

// === Create Single Object ===
const OBJECT_TYPES: SpreadObject['type'][] = ['character', 'prop', 'background', 'foreground'];
const OBJECT_NAMES = ['main_character', 'side_character', 'prop_1', 'background_1'];
const OBJECT_STATES: Record<string, string[]> = {
  main_character: ['default', 'happy', 'sad'],
  side_character: ['default', 'talking'],
  prop_1: ['default'],
  background_1: ['day', 'night'],
};

function createMockObject(
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

// === Factory Options ===
export interface CreatePlayableSpreadOptions {
  spreadCount: number;
  textboxCount: number;
  objectCount: number;
  language: 'en_US' | 'vi_VN';
  isDPS?: boolean;
}

// === Create Multiple Playable Spreads ===
export function createPlayableSpreads(options: CreatePlayableSpreadOptions): PlayableSpread[] {
  const { spreadCount, textboxCount, objectCount, language, isDPS = true } = options;
  resetGeometryIndices();

  return Array.from({ length: spreadCount }, (_, spreadIndex) => {
    const leftPageNum = spreadIndex * 2;
    const rightPageNum = leftPageNum + 1;

    // Create pages based on DPS setting
    const pages: PageData[] = isDPS
      ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
      : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

    // Create textboxes
    const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
      createMockTextbox(language)
    );

    // Create objects (pass isDPS for background ratio)
    const objects: SpreadObject[] = Array.from({ length: objectCount }, () =>
      createMockObject({}, isDPS)
    );

    // Empty animations array (will be populated in animation-editor mode)
    const animations: Animation[] = [];

    // Playable spread data
    const spread: PlayableSpread = {
      id: generateUUID(),
      pages,
      images: [], // No images per plan
      textboxes,
      objects,
      animations,
      manuscript: SAMPLE_TEXTS[language]?.[spreadIndex % 6] || '',
    };

    return spread;
  });
}

export default {
  createPlayableSpreads,
};
