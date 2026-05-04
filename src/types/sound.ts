// Public type aliases for the legacy `Sound` API. The canonical types live in
// `@/features/audio-library/types`; this file re-exports for zero-call-site
// break in unrelated consumers (e.g. editor feature).

export type {
  AudioResource as Sound,
  AudioRow as SoundRow,
  AudioSource as SoundSource,
  AudioType as SoundType,
  AudioFilterState as SoundsFilterState,
  AudioActiveModal as SoundsActiveModal,
} from '@/features/audio-library/types';
