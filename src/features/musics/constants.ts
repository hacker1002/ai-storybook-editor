import type { MusicsFilterState } from '@/types/music';

export const DEFAULT_MUSICS_FILTERS: MusicsFilterState = {
  search: '',
  source: null,
  type: null,
  tags: [],
  durationRange: null,
};
