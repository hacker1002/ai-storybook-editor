// index.ts - Barrel exports for PlayableSpreadView component family

// === Types ===
export type {
  OperationMode,
  ActiveCanvas,
  PlayMode,
  ItemType,
  PlayableSpread,
  RemixAsset,
  RemixEditorState,
  AssetSwapParams,
  PlayableSpreadViewProps,
  PlayableHeaderProps,
  PlayableThumbnailListProps,
  AnimationEditorCanvasProps,
  RemixEditorCanvasProps,
  PromptToolbarProps,
  PlayerCanvasProps,
  PlaybackStatus,
} from './types';

// === Constants ===
export { LAYOUT, THUMBNAIL_STYLES, PLAY_MODE_CYCLE, VOLUME, KEYBOARD_SHORTCUTS } from './constants';

// === Types - new ===
export type { PlayerControlSidebarProps } from './types';

// === Components ===
export { PlayableSpreadView } from './playable-spread-view';
export { PlayableHeader } from './playable-header';
export { PlayableThumbnailList } from './playable-thumbnail-list';
export { AnimationEditorCanvas } from './animation-editor-canvas';
export { RemixEditorCanvas } from './remix-editor-canvas';
export { PromptToolbar } from './prompt-toolbar';
export { SelectionOverlay } from './selection-overlay';
export { PlayerCanvas } from './player-canvas';

// === Components - new ===
export { PlayerControlSidebar } from './player-control-sidebar';

// === Store selectors ===
export {
  usePlayMode,
  useIsPlaying,
  useVolume,
  usePlayerPhase,
  usePlaybackActions,
} from './stores/playback-store';

// === Constants - new ===
export { RAPID_NEXT_THRESHOLD, SIDEBAR, SIDEBAR_BUTTONS } from './constants';
