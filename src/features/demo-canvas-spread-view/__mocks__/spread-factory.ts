// __mocks__/spread-factory.ts - Mock data factory for BaseSpread objects

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
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
const IMAGE_ASPECT_RATIO = 4 / 3;   // Target image aspect ratio
const CANVAS_ASPECT_RATIO = 4 / 3;  // Canvas spread aspect ratio (800x600)

// === Helper: Random geometry ===
function randomGeometry(page: 'left' | 'right' | 'full' = 'full', forImage = false): Geometry {
  let xMin = 0, xMax = 70;

  if (page === 'left') {
    xMin = 5;
    xMax = 40;
  } else if (page === 'right') {
    xMin = 55;
    xMax = 90;
  }

  const w = randomBetween(20, 40);
  // Formula: actualAspect = (w%/h%) * canvasAspect
  // To get IMAGE_ASPECT: h% = w% * canvasAspect / imageAspect
  const h = forImage
    ? w * CANVAS_ASPECT_RATIO / IMAGE_ASPECT_RATIO  // w * (4/3) / (4/3) = w
    : randomBetween(20, 50);

  return {
    x: randomBetween(xMin, xMax),
    y: randomBetween(5, 40),
    w,
    h: Math.round(h * 10) / 10, // Round to 1 decimal for clean values
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
  return {
    id: generateUUID(),
    title: `Image ${randomBetween(1, 100)}`,
    geometry: randomGeometry('left', true), // forImage=true for 4:3 ratio
    art_note: ART_NOTES[randomBetween(0, ART_NOTES.length - 1)],
    visual_description: ART_NOTES[randomBetween(0, ART_NOTES.length - 1)],
    image_references: [],
    sketches: [],
    illustrations: [],
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
      geometry: randomGeometry('right'),
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
  language?: string;
  withGeneratedImages?: boolean;
}

export function createMockSpread(options: CreateSpreadOptions = {}): BaseSpread {
  const {
    spreadIndex = 0,
    isDPS = true,
    imageCount = 1,
    textboxCount = 1,
    language = 'en_US',
    withGeneratedImages = false,
  } = options;

  const leftPageNum = spreadIndex * 2;
  const rightPageNum = leftPageNum + 1;

  // Create pages
  const pages: PageData[] = isDPS
    ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
    : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

  // Create images
  const images: SpreadImage[] = Array.from({ length: imageCount }, (_, i) =>
    createMockImage({
      geometry: randomGeometry(i % 2 === 0 ? 'left' : 'right', true), // forImage=true for 4:3 ratio
      illustrations: withGeneratedImages
        ? [
            {
              media_url: `https://picsum.photos/seed/${generateUUID()}/400/300`,
              created_time: new Date().toISOString(),
              is_selected: true,
            },
          ]
        : [],
    })
  );

  // Create textboxes
  const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
    createMockTextbox(language)
  );

  return {
    id: generateUUID(),
    pages,
    images,
    textboxes,
    objects: [],
    animations: [],
    manuscript: SAMPLE_TEXTS[language as keyof typeof SAMPLE_TEXTS]?.[spreadIndex % 6] || '',
  };
}

// === Create Multiple Spreads ===
export function createMockSpreads(
  count: number,
  options: Omit<CreateSpreadOptions, 'spreadIndex'> = {}
): BaseSpread[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSpread({ ...options, spreadIndex: i })
  );
}

export default {
  createMockImage,
  createMockTextbox,
  createMockPage,
  createMockSpread,
  createMockSpreads,
};
