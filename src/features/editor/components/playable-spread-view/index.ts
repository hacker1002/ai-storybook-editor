// index.ts - Barrel exports for PlayableSpreadView component family

// === Domain Types (re-export from @/types for barrel consumers) ===
export type {
  OperationMode,
  ActiveCanvas,
  PlayMode,
  PlayableSpread,
  RemixAsset,
  RemixEditorState,
  AssetSwapParams,
  PlayerPhase,
  AnimationStep,
  ReplayableItem,
  PlayerState,
  PlayerAction,
} from '@/types/playable-types';

export type { ItemType } from '@/types/spread-types';

// === Shared Constants (re-export from @/constants for barrel consumers) ===
export { PLAYABLE_ZOOM, ANIMATION_PRESETS } from '@/constants/playable-constants';

// === Components ===
export { PlayableSpreadView } from './playable-spread-view';
export { PlayableEditorHeader } from './playable-editor-header';
export { PlayableThumbnailList } from './playable-thumbnail-list';
export { AnimationEditorCanvas } from './animation-editor-canvas';
export { RemixEditorCanvas } from './remix-editor-canvas';
export { PromptToolbar } from './prompt-toolbar';
export { SelectionOverlay } from './selection-overlay';
export { PlayerCanvas } from './player-canvas';
export { PlayerControlSidebar } from './player-control-sidebar';
export { BranchPathModal } from './branch-path-modal';

// === Store selectors ===
export {
  usePlayMode,
  useIsPlaying,
  useVolume,
  usePlayerPhase,
  usePlaybackActions,
} from '@/stores/animation-playback-store';
