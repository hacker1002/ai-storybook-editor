// __mocks__/playable-spread-factory.ts - Mock factory for PlayableSpread data

import type {
  PlayableSpread,
} from '@/components/playable-spread-view/types';
import type { SpreadAnimation } from '@/components/shared';
import type {
  PageData,
  SpreadTextbox,
  SpreadImage,
  Geometry,
  Typography,
  SpreadItemMediaType,
} from '@/components/canvas-spread-view/types';
import { ANIMATION_PRESETS } from '@/components/playable-spread-view/constants';

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
  { w: 200, h: 300 },  // 2:3 portrait
  { w: 300, h: 300 },  // 1:1 square
  { w: 400, h: 300 },  // 4:3 landscape
  { w: 300, h: 200 },  // 3:2 landscape
];

const TEXTBOX_GEOMETRIES: Geometry[] = [
  { x: 53, y: 65, w: 42, h: 28 },
  { x: 55, y: 10, w: 40, h: 20 },
  { x: 5, y: 70, w: 40, h: 22 },
  { x: 5, y: 5, w: 38, h: 18 },
  { x: 30, y: 80, w: 45, h: 15 },
];

// Image position templates by type
const IMAGE_POSITIONS: Record<SpreadItemMediaType, { x: number; y: number }[]> = {
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
const IMAGE_SIZE_RANGES: Record<SpreadItemMediaType, { min: number; max: number }> = {
  background: { min: 100, max: 100 },
  character: { min: 15, max: 28 },
  prop: { min: 6, max: 15 },
  foreground: { min: 20, max: 100 },
  raw: { min: 20, max: 40 },
  other: { min: 15, max: 30 },
};

// Z-Index mapping
const Z_INDEX_BY_TYPE: Record<SpreadItemMediaType, number> = {
  background: 50,
  character: 125,
  prop: 175,
  foreground: 250,
  raw: 150,
  other: 150,
};

// Track usage indices
let textboxGeoIndex = 0;
const imageGeoIndices: Record<SpreadItemMediaType, number> = {
  background: 0, character: 0, prop: 0, foreground: 0, raw: 0, other: 0,
};

function resetGeometryIndices(): void {
  textboxGeoIndex = 0;
  const keys: SpreadItemMediaType[] = ['background', 'character', 'prop', 'foreground', 'raw', 'other'];
  keys.forEach(k => imageGeoIndices[k] = 0);
}

function calcHeightPercent(widthPercent: number, imgW: number, imgH: number): number {
  const imageRatio = imgW / imgH;
  return Math.round(widthPercent * CANVAS_RATIO / imageRatio * 10) / 10;
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

type EntrancePreset = 'appear' | 'fadeIn' | 'flyInLeft' | 'flyInRight' | 'flyInTop' | 'flyInBottom' | 'floatInUp' | 'floatInDown' | 'floatInLeft' | 'zoomIn';
type ExitPreset = 'disappear' | 'fadeOut' | 'flyOutRight' | 'flyOutLeft' | 'flyOutTop' | 'floatOutUp' | 'floatOutDown';
type EmphasisPreset = 'spin' | 'spinDouble' | 'grow' | 'shrink' | 'teeter' | 'transparency';
type MotionPreset = 'lineMove' | 'arcMove';
type AnimationPreset = EntrancePreset | ExitPreset | EmphasisPreset | MotionPreset;

const ENTRANCE_PRESETS: EntrancePreset[] = ['appear', 'fadeIn', 'flyInLeft', 'flyInRight', 'flyInTop', 'flyInBottom', 'floatInUp', 'floatInDown', 'floatInLeft', 'zoomIn'];
const EXIT_PRESETS: ExitPreset[] = ['disappear', 'fadeOut', 'flyOutRight', 'flyOutLeft', 'flyOutTop', 'floatOutUp', 'floatOutDown'];
const EMPHASIS_PRESETS: EmphasisPreset[] = ['spin', 'spinDouble', 'grow', 'shrink', 'teeter', 'transparency'];

function randomEntrance(): EntrancePreset {
  return ENTRANCE_PRESETS[randomBetween(0, ENTRANCE_PRESETS.length - 1)];
}

function randomExit(): ExitPreset {
  return EXIT_PRESETS[randomBetween(0, EXIT_PRESETS.length - 1)];
}

function randomEmphasis(): EmphasisPreset {
  return EMPHASIS_PRESETS[randomBetween(0, EMPHASIS_PRESETS.length - 1)];
}

/** Create a SpreadAnimation from a preset key */
function createAnimation(
  order: number,
  targetId: string,
  targetType: SpreadAnimation['target']['type'],
  preset: AnimationPreset,
  triggerType: SpreadAnimation['trigger_type'] = 'after_previous',
  overrides: Partial<SpreadAnimation['effect']> = {}
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
  textboxes: SpreadTextbox[]
): SpreadAnimation[] {
  const animations: SpreadAnimation[] = [];
  let order = 0;

  const bgImages = images.filter(img => img.type === 'background');
  const characterImages = images.filter(img => img.type === 'character');
  const propImages = images.filter(img => img.type === 'prop');
  const otherImages = images.filter(img =>
    !['background', 'character', 'prop'].includes(img.type ?? '')
  );

  // ── Auto: background entrance on spread load ──
  bgImages.forEach((bg) => {
    animations.push(createAnimation(
      order++, bg.id, 'image', randomEntrance(),
      order === 1 ? 'after_previous' : 'with_previous'
    ));
  });

  // ── on_next: characters entrance (first triggers step, rest with_previous) ──
  characterImages.forEach((char, i) => {
    animations.push(createAnimation(
      order++, char.id, 'image', randomEntrance(),
      i === 0 ? 'on_next' : 'with_previous',
      { delay: i * 200 }
    ));
  });

  // ── on_next: textboxes entrance (sequential via after_previous) ──
  textboxes.forEach((tb, i) => {
    animations.push(createAnimation(
      order++, tb.id, 'textbox', randomEntrance(),
      i === 0 ? 'on_next' : 'after_previous'
    ));
  });

  // ── on_next: props entrance ──
  propImages.forEach((prop, i) => {
    animations.push(createAnimation(
      order++, prop.id, 'image', randomEntrance(),
      i === 0 ? 'on_next' : 'with_previous'
    ));
  });

  // ── on_click: emphasis on characters (spin/grow/shrink/teeter/transparency) ──
  characterImages.forEach((char, i) => {
    const preset = randomEmphasis();
    const overrides: Partial<SpreadAnimation['effect']> = {};
    if (preset === 'grow') overrides.amount = 1.5;
    if (preset === 'shrink') overrides.amount = 0.6;
    if (preset === 'transparency') overrides.amount = 0.3;
    const anim = createAnimation(
      order++, char.id, 'image', preset,
      i === 0 ? 'on_click' : 'with_previous',
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
      order++, target.id, 'image', 'lineMove', 'on_click',
      { geometry: { x: destX, y: destY, w: target.geometry.w, h: target.geometry.h } }
    );
    anim.click_loop = randomBetween(3, 5);
    animations.push(anim);
  }

  // ── on_next: textboxes exit ──
  textboxes.forEach((tb, i) => {
    animations.push(createAnimation(
      order++, tb.id, 'textbox', randomExit(),
      i === 0 ? 'on_next' : 'after_previous'
    ));
  });

  // ── on_next: remaining characters exit ──
  characterImages.slice(1).forEach((char, i) => {
    animations.push(createAnimation(
      order++, char.id, 'image', randomExit(),
      i === 0 ? 'on_next' : 'with_previous'
    ));
  });

  // ── on_next: other images entrance ──
  otherImages.forEach((img, i) => {
    animations.push(createAnimation(
      order++, img.id, 'image', randomEntrance(),
      i === 0 ? 'on_next' : 'with_previous'
    ));
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

function getRandomImageGeometry(type: SpreadItemMediaType, isDPS = true): ImageWithGeometry {
  const positions = IMAGE_POSITIONS[type] || IMAGE_POSITIONS.other;
  const sizeRange = IMAGE_SIZE_RANGES[type] || IMAGE_SIZE_RANGES.other;

  const idx = imageGeoIndices[type] % positions.length;
  imageGeoIndices[type]++;

  const pos = positions[idx];

  const ratio = type === 'background'
    ? (isDPS ? BACKGROUND_RATIO_DPS : BACKGROUND_RATIO_SINGLE)
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

// Weighted type distribution for images
const IMAGE_TYPE_WEIGHTS: { type: SpreadItemMediaType; weight: number }[] = [
  { type: 'character', weight: 40 },
  { type: 'prop', weight: 40 },
  { type: 'background', weight: 10 },
  { type: 'foreground', weight: 10 },
];

function getWeightedRandomType(): SpreadItemMediaType {
  const totalWeight = IMAGE_TYPE_WEIGHTS.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of IMAGE_TYPE_WEIGHTS) {
    random -= item.weight;
    if (random <= 0) return item.type;
  }
  return 'prop';
}

// Type-specific name pools
const IMAGE_NAMES_BY_TYPE: Record<SpreadItemMediaType, string[]> = {
  character: ['main_character', 'side_character', 'character_npc'],
  prop: ['prop_1', 'prop_2', 'prop_item'],
  background: ['background_1', 'background_scene', 'bg_layer'],
  foreground: ['foreground_1', 'foreground_overlay', 'fg_layer'],
  raw: ['raw_image'],
  other: ['other_item'],
};

// Create SpreadImage with retouch fields (z-index, player_visible, editor_visible, name, type)
function createMockImage(
  overrides: Partial<SpreadImage> = {},
  isDPS = true
): SpreadImage {
  const type: SpreadItemMediaType = getWeightedRandomType();
  const namesForType = IMAGE_NAMES_BY_TYPE[type] || ['unnamed'];
  const name = namesForType[randomBetween(0, namesForType.length - 1)];

  const { geometry, dimensions } = getRandomImageGeometry(type, isDPS);

  return {
    id: generateUUID(),
    title: `Image ${randomBetween(1, 100)}`,
    geometry,
    media_url: `https://picsum.photos/seed/${generateUUID()}/${dimensions.w}/${dimensions.h}`,
    // Retouch fields
    'z-index': Z_INDEX_BY_TYPE[type],
    player_visible: true,
    editor_visible: true,
    name,
    type,
    ...overrides,
  };
}

// === Factory Options ===
export interface CreatePlayableSpreadOptions {
  spreadCount: number;
  textboxCount: number;
  imageCount: number;
  language: 'en_US' | 'vi_VN';
  isDPS?: boolean;
}

// === Create Multiple Playable Spreads ===
export function createPlayableSpreads(options: CreatePlayableSpreadOptions): PlayableSpread[] {
  const { spreadCount, textboxCount, imageCount, language, isDPS = true } = options;
  resetGeometryIndices();

  return Array.from({ length: spreadCount }, (_, spreadIndex) => {
    const leftPageNum = spreadIndex * 2;
    const rightPageNum = leftPageNum + 1;

    const pages: PageData[] = isDPS
      ? [createMockPage(`${leftPageNum}-${rightPageNum}`)]
      : [createMockPage(leftPageNum), createMockPage(rightPageNum)];

    const textboxes: SpreadTextbox[] = Array.from({ length: textboxCount }, () =>
      createMockTextbox(language)
    );

    const images: SpreadImage[] = Array.from({ length: imageCount }, () =>
      createMockImage({}, isDPS)
    );

    const animations = generateSpreadAnimations(images, textboxes);

    const spread: PlayableSpread = {
      id: generateUUID(),
      pages,
      images,
      textboxes,
      animations,
      manuscript: SAMPLE_TEXTS[language]?.[spreadIndex % 6] || '',
    };

    return spread;
  });
}

export default {
  createPlayableSpreads,
};
