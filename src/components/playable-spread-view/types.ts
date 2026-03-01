// types.ts - Type definitions for PlayableSpreadView component family

import type { BaseSpread } from '../shared';

// === Core Enums/Types ===
export type OperationMode = 'animation-editor' | 'remix-editor' | 'player';
export type ActiveCanvas = 'animation-editor' | 'remix-editor' | 'player';
export type PlayMode = 'off' | 'semi-auto' | 'auto';
export type ItemType = 'object' | 'textbox';
export type AnimationMediaType = 'image' | 'video' | 'audio' | 'textbox';

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
export interface AddAnimationParams {
  type: AnimationMediaType;
  targetId: string | null;
  targetType: ItemType | null;
  spreadId: string;
}

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
  onSpreadClick: (spreadId: string) => void;
}

// === Canvas Props ===
export interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  zoomLevel?: number;
  onAddAnimation: (params: AddAnimationParams) => void;
}

export interface RemixEditorCanvasProps {
  spread: PlayableSpread;
  assets: RemixAsset[];
  zoomLevel?: number;
  onAssetSwap: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
}

export interface PlayerCanvasProps {
  spread: PlayableSpread;
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number; // 0-100, where 0 means muted
  hasNext: boolean; // Has next spread available
  onSpreadComplete: (spreadId: string) => void;
}
