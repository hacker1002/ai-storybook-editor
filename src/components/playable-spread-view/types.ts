// types.ts - Type definitions for PlayableSpreadView component family

import type { BaseSpread, SpreadAnimation } from '../shared';

// === Player Phases ===
export type PlayerPhase = 'idle' | 'playing' | 'awaiting_next' | 'awaiting_click' | 'complete';

// === Animation Step ===
// Each step = 1 trigger + all following after_previous/with_previous animations
export interface AnimationStep {
  index: number;
  triggerType: 'on_next' | 'on_click' | 'auto';
  targetId?: string;        // only when triggerType = 'on_click'
  clickLoop?: number;       // only when triggerType = 'on_click', replay count
  animations: SpreadAnimation[];
}

// === Replayable Item (click_loop tracking) ===
export interface ReplayableItem {
  itemId: string;
  stepIndex: number;
  remainingReplays: number;
}

// === Player State ===
export interface PlayerState {
  phase: PlayerPhase;
  steps: AnimationStep[];
  currentStepIndex: number;           // -1 = not started
  pendingClickTargetId: string | null;
  replayableItems: Map<string, ReplayableItem>;
}

// === Player Actions (Events) ===
export type PlayerAction =
  | { type: 'RESET'; steps: AnimationStep[] }
  | { type: 'USER_NEXT' }
  | { type: 'USER_BACK' }
  | { type: 'USER_CLICK'; itemId: string }
  | { type: 'STEP_COMPLETE' }
  | { type: 'CLICK_LOOP_REPLAY'; itemId: string };

// === Playback Status (emitted from PlayerCanvas for sidebar highlight) ===
export interface PlaybackStatus {
  /** order values of SpreadAnimations currently animating */
  activeAnimationIndices: number[];
}

// === Core Enums/Types ===
export type OperationMode = 'animation-editor' | 'remix-editor' | 'player';
export type ActiveCanvas = 'animation-editor' | 'remix-editor' | 'player';
export type PlayMode = 'off' | 'semi-auto' | 'auto';
export type ItemType = 'image' | 'textbox' | 'shape' | 'video' | 'audio';

// === PlayableSpread ===
// Extend from BaseSpread, animations is required for playable context
export interface PlayableSpread extends BaseSpread {
  animations: SpreadAnimation[];
}

// === Remix Asset (align with DB schema) ===
export interface RemixAsset {
  name: string;           // Display name
  key: string;            // Asset key (e.g., "miu_cat")
  type: 'character' | 'prop';
  image_url: string;      // Current swapped image URL
  target: {
    name: string;         // Original asset name
    key: string;          // Original asset key
  };
}

// === Remix Editor State ===
export interface RemixEditorState {
  selectedItemId: string | null;
  selectedAssetKey: string | null;
  toolbarPosition: { x: number; y: number } | null;
  prompt: string;
  referenceImage: File | null;
  isSubmitting: boolean;
  editingTextboxId: string | null;
}

// === PromptToolbar Props ===
export interface PromptToolbarProps {
  position: { top: number; left: number } | null;
  prompt: string;
  referenceImage: File | null;
  isSubmitting: boolean;
  error?: string | null;  // inline error display for file upload
  onPromptChange: (prompt: string) => void;
  onReferenceUpload: (file: File | null) => void;
  onSubmit: () => void;
  onClose: () => void;
}

// === Action Parameters ===
export interface AssetSwapParams {
  prompt: string;
  referenceImage: File | null;
  targetId: string;
  spreadId: string;
}

// === Root Component Props ===
export interface PlayableSpreadViewProps {
  mode: OperationMode;
  spreads: PlayableSpread[];
  assets?: RemixAsset[];
  onItemSelect?: (itemType: ItemType | null, itemId: string | null) => void;
  onAssetSwap?: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
  onSpreadSelect?: (spreadId: string) => void;
  onPlaybackStatusChange?: (status: PlaybackStatus) => void;
}

// === Child Component Props ===
export interface PlayableHeaderProps {
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;            // 0-100; 0 = muted
  hasPrevious: boolean;
  hasNext: boolean;
  onPlayModeChange: (mode: PlayMode) => void;
  onPlayToggle: () => void;
  onSkipPrevious: () => void;
  onSkipNext: () => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;  // toggle volume 0 ↔ previousVolume (managed by parent)
}

export interface PlayableThumbnailListProps {
  spreads: PlayableSpread[];
  selectedId: string | null;
  onSpreadClick: (spreadId: string) => void;
}

// === Canvas Props ===
export interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  onItemSelect: (itemType: ItemType | null, itemId: string | null) => void;
}

export interface RemixEditorCanvasProps {
  spread: PlayableSpread;
  assets: RemixAsset[];
  onAssetSwap: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
}

export interface PlayerCanvasProps {
  spread: PlayableSpread;
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onSpreadComplete: (spreadId: string) => void;
  onSpreadChange: (direction: 'prev' | 'next') => void;
  onPlaybackStatusChange?: (status: PlaybackStatus) => void;
}
