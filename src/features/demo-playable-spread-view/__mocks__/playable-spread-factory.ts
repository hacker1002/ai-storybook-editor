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

// === Helper: Random geometry ===
function randomGeometry(page: 'left' | 'right' | 'full' = 'full'): Geometry {
  let xMin = 0, xMax = 70;

  if (page === 'left') {
    xMin = 5;
    xMax = 40;
  } else if (page === 'right') {
    xMin = 55;
    xMax = 90;
  }

  const w = randomBetween(20, 40);
  const h = randomBetween(20, 50);

  return {
    x: randomBetween(xMin, xMax),
    y: randomBetween(5, 40),
    w,
    h,
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
      geometry: randomGeometry('right'),
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

function createMockObject(overrides: Partial<SpreadObject> = {}): SpreadObject {
  const typeIndex = randomBetween(0, OBJECT_TYPES.length - 1);
  const type = OBJECT_TYPES[typeIndex];
  const name = OBJECT_NAMES[typeIndex] || 'unnamed';
  const states = OBJECT_STATES[name] || ['default'];
  const state = states[randomBetween(0, states.length - 1)];

  // Z-index defaults by type
  const zIndexMap: Record<SpreadObject['type'], number> = {
    background: 50,
    character: 125,
    prop: 175,
    foreground: 250,
    raw: 150,
    other: 150,
  };

  return {
    id: generateUUID(),
    name,
    state,
    type,
    media_url: `https://picsum.photos/seed/${generateUUID()}/200/300`,
    media_type: 'image',
    geometry: {
      x: randomBetween(50, 70),
      y: randomBetween(10, 40),
      w: randomBetween(15, 30),
      h: randomBetween(20, 40),
    },
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
}

// === Create Multiple Playable Spreads ===
export function createPlayableSpreads(options: CreatePlayableSpreadOptions): PlayableSpread[] {
  const { spreadCount, textboxCount, objectCount, language } = options;

  return Array.from({ length: spreadCount }, (_, spreadIndex) => {
    const leftPageNum = spreadIndex * 2;
    const rightPageNum = leftPageNum + 1;

    // Create pages (always DPS for playable spreads)
    const pages: PageData[] = [createMockPage(`${leftPageNum}-${rightPageNum}`)];

    // Create textboxes
    const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
      createMockTextbox(language)
    );

    // Create objects
    const objects: SpreadObject[] = Array.from({ length: objectCount }, () =>
      createMockObject()
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
