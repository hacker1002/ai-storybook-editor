// template-layout-utils.ts — Geometry conversion + template item builders for spread creation

import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import type { Geometry, SpreadImage, SpreadTextbox, Typography } from '@/types/spread-types';
import type { DummyImage, DummyTextbox } from '@/types/dummy';
import type {
  TemplateLayout,
  TemplateLayoutGeometry,
  TypographySettings,
} from '@/types/editor';

// Page-relative geometry (0-100% of single page) → spread-relative geometry
export function convertPageGeometryToSpread(
  geo: TemplateLayoutGeometry,
  side: 'left' | 'right',
): Geometry {
  const halfX = geo.x / 2;
  const halfW = geo.w / 2;
  return {
    x: side === 'left' ? halfX : halfX + 50,
    y: geo.y,
    w: halfW,
    h: geo.h,
  };
}

function toSpreadGeometry(
  geo: TemplateLayoutGeometry,
  side: 'full' | 'left' | 'right',
): Geometry {
  if (side === 'full') return { x: geo.x, y: geo.y, w: geo.w, h: geo.h };
  return convertPageGeometryToSpread(geo, side);
}

export function findTemplateById(
  layouts: TemplateLayout[],
  id: string | undefined,
): TemplateLayout | undefined {
  if (!id) return undefined;
  return layouts.find((l) => l.id === id);
}

// === Illustration (SpreadImage / SpreadTextbox) builders ===

export function buildIllustrationItemsFromTemplate(
  template: TemplateLayout,
  side: 'full' | 'left' | 'right',
  langCode: string,
  bookTypography: Record<string, TypographySettings> | null,
): { images: SpreadImage[]; textboxes: SpreadTextbox[] } {
  const typo: Typography = mapTypographyToTextbox(
    bookTypography?.[langCode] ?? DEFAULT_TYPOGRAPHY,
  );

  const images: SpreadImage[] = template.images.map((img) => ({
    id: crypto.randomUUID(),
    geometry: toSpreadGeometry(img.geometry, side),
    'z-index': img['z-index'],
    player_visible: false,
    editor_visible: true,
    illustrations: [],
  }));

  const textboxes: SpreadTextbox[] = template.textboxes.map((tb) => ({
    id: crypto.randomUUID(),
    'z-index': tb['z-index'],
    player_visible: false,
    editor_visible: true,
    [langCode]: {
      text: '',
      geometry: toSpreadGeometry(tb.geometry, side),
      typography: typo,
    },
  }));

  return { images, textboxes };
}

// === Dummy (DummyImage / DummyTextbox) builders ===

const DUMMY_IMAGE_TYPOGRAPHY = { size: 14, color: '#333333' };

export function buildDummyItemsFromTemplate(
  template: TemplateLayout,
  side: 'full' | 'left' | 'right',
  langCode: string,
): { images: DummyImage[]; textboxes: DummyTextbox[] } {
  const images: DummyImage[] = template.images.map((img) => ({
    id: crypto.randomUUID(),
    art_note: '',
    geometry: toSpreadGeometry(img.geometry, side),
    typography: DUMMY_IMAGE_TYPOGRAPHY,
  }));

  const textboxes: DummyTextbox[] = template.textboxes.map((tb) => ({
    id: crypto.randomUUID(),
    [langCode]: {
      text: '',
      geometry: toSpreadGeometry(tb.geometry, side),
      typography: mapTypographyToTextbox(DEFAULT_TYPOGRAPHY),
    },
  }));

  return { images, textboxes };
}

// Merge two sets of items (left page + right page)
export function mergeItems<T extends { images: unknown[]; textboxes: unknown[] }>(
  a: T,
  b: T,
): T {
  return {
    ...a,
    images: [...a.images, ...b.images],
    textboxes: [...a.textboxes, ...b.textboxes],
  };
}
