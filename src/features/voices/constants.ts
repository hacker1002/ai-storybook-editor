import type { VoicesFilterState } from '@/types/voice';

export const DEFAULT_VOICES_FILTERS: VoicesFilterState = {
  search: '',
  type: null,
  gender: null,
  language: null,
  tag: null,
};
