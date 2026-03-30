// prop-constants.ts - Constants for Props creative space dropdowns and tabs

import type { ContentTab, PropType } from '@/types/prop-types';

export const PROP_TYPE_OPTIONS = [
  { value: 'narrative' as PropType, label: 'Narrative' },
  { value: 'anchor' as PropType, label: 'Anchor' },
] as const;

export const CONTENT_TABS = [
  { value: 'variants' as ContentTab, label: 'Variants' },
  { value: 'sounds' as ContentTab, label: 'Sounds' },
  { value: 'crops' as ContentTab, label: 'Crops' },
] as const;

export const CATEGORY_FILTER_OPTIONS = [
  { value: null as number | null, label: 'All Categories' },
  { value: 1, label: 'Human' },
  { value: 2, label: 'Animal' },
  { value: 3, label: 'Plant' },
  { value: 4, label: 'Item' },
] as const;

export const DEFAULT_CONTENT_TAB: ContentTab = 'variants';
