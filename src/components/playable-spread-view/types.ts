// types.ts - Type definitions for PlayableSpreadView component family

import type { BaseSpread } from '../canvas-spread-view/types';

// === Core Enums/Types ===
export type OperationMode = 'animation-editor' | 'remix-editor' | 'player';
export type ActiveCanvas = 'animation-editor' | 'remix-editor' | 'player';
export type PlayMode = 'off' | 'semi-auto' | 'auto';
export type ItemType = 'object' | 'textbox';
export type AnimationMediaType = 'image' | 'video' | 'sound' | 'textbox';

// === Animation Editor State ===
export interface AnimationEditorState {
  selectedItemId: string | null;
  selectedItemType: ItemType | null;
  toolbarOpen: boolean;
}

export interface AddAnimationToolbarProps {
  position: { top: number; left: number } | null;
  targetType: ItemType;
  onSelectOption: (type: AnimationMediaType) => void;
  onClose: () => void;
}

// === PlayableSpread ===
// Extend from BaseSpread, add animations array
export interface PlayableSpread extends BaseSpread {
  animations?: Animation[];
}

// === Animation Interface ===
export interface Animation {
  order: number;
  type: 'textbox' | 'image' | 'video' | 'audio';
  target: { id: string; type: 'textbox' | 'object' };
  trigger_type: 'on_click' | 'with_previous' | 'after_previous';
  effect: {
    type: number;
    geometry?: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    delay?: number;
    duration?: number;
    loop?: number;
    amount?: number;
    direction?: 'left' | 'right' | 'up' | 'down';
  };
}

// === Remix Asset ===
export interface RemixAsset {
  id: string;
  name: string;
  type: 'character' | 'prop' | 'background' | 'foreground';
  media_url: string;
  visual_description?: string;
}

// === Action Parameters ===
export interface AddAnimationParams {
  type: AnimationMediaType;
  targetId: string | null;
  targetType: ItemType | null;
  spreadId: string;
}

export interface AssetSwapParams {
  prompt: string;
  referenceImage?: File;
  targetId: string;
  spreadId: string;
}

// === Root Component Props ===
export interface PlayableSpreadViewProps {
  mode: OperationMode;
  spreads: PlayableSpread[];
  language?: string;
  assets?: RemixAsset[];
  onAddAnimation?: (params: AddAnimationParams) => void;
  onAssetSwap?: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
  onSpreadSelect?: (spreadId: string) => void;
}

// === Child Component Props ===
export interface PlayableHeaderProps {
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  playDisabled: boolean;
  onPlayModeChange: (mode: PlayMode) => void;
  onPlayToggle: () => void;
  onSkipPrevious: () => void;
  onSkipNext: () => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

export interface PlayableThumbnailListProps {
  spreads: PlayableSpread[];
  selectedId: string | null;
  language: string;
  onSpreadClick: (spreadId: string) => void;
}

// === Canvas Props ===
export interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  language: string;
  zoomLevel?: number;
  onAddAnimation: (params: AddAnimationParams) => void;
}

export interface RemixEditorCanvasProps {
  spread: PlayableSpread;
  assets: RemixAsset[];
  onAssetSwap: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
}

export interface PlayerCanvasProps {
  spread: PlayableSpread;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  onSpreadComplete: (spreadId: string) => void;
}
