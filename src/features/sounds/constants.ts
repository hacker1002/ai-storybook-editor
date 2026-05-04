import type { SoundsFilterState } from '@/types/sound';

export const DEFAULT_SOUNDS_FILTERS: SoundsFilterState = {
  search: '',
  source: null,
  type: null,
  tags: [],
  durationRange: null,
};
