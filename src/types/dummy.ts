// Dummy types for DummyCreativeSpace feature
import type { Geometry, Typography, PageData } from '@/components/shared/types';

export type DummyType = 'prose' | 'verse' | 'poetry';

export interface DummyTypography {
  size: number;
  color: string;
}

export interface DummyImage {
  id: string;
  art_note: string;
  geometry: Geometry;
  typography: DummyTypography;
}

export interface DummyTextboxContent {
  text: string;
  geometry: Geometry;
  typography: Typography;
}

export interface DummyTextbox {
  id: string;
  [languageKey: string]: DummyTextboxContent | string;
}

export interface DummySpread {
  id: string;
  pages: PageData[];
  images: DummyImage[];
  textboxes: DummyTextbox[];
}

export interface ManuscriptDummy {
  id: string;
  title: string;
  type: DummyType;
  spreads: DummySpread[];
}

// Constants
export const FONT_SIZE_CONFIG = {
  min: 8,
  max: 72,
  default: 16,
  step: 1,
} as const;

export const DEFAULT_COLOR = '#000000';

export const GEOMETRY_CONFIG = {
  min: 0,
  max: 100,
  step: 1,
} as const;

export const DEFAULT_DUMMY_TITLE = 'New Dummy';

// Helper to get first available textbox language key
export function getFirstTextboxKey(textbox: DummyTextbox): string | undefined {
  return Object.keys(textbox).find(k => k !== 'id');
}
