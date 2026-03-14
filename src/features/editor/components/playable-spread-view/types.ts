// types.ts - Component-scoped Props for PlayableSpreadView
// Domain types moved to @/types/playable-types.ts and @/types/spread-types.ts

import type { ItemType } from '@/types/spread-types';
import type {
  OperationMode,
  ActiveCanvas,
  PlayMode,
  PlayableSpread,
  RemixAsset,
  AssetSwapParams,
} from '@/types/playable-types';

// Re-export domain types for backward compat within this component family
export type {
  PlayerPhase,
  AnimationStep,
  ReplayableItem,
  PlayerState,
  PlayerAction,
  OperationMode,
  ActiveCanvas,
  PlayMode,
  PlayableSpread,
  RemixAsset,
  RemixEditorState,
  AssetSwapParams,
} from '@/types/playable-types';

export type { ItemType } from '@/types/spread-types';

// === PromptToolbar Props ===
export interface PromptToolbarProps {
  position: { top: number; left: number } | null;
  prompt: string;
  referenceImage: File | null;
  isSubmitting: boolean;
  error?: string | null;
  onPromptChange: (prompt: string) => void;
  onReferenceUpload: (file: File | null) => void;
  onSubmit: () => void;
  onClose: () => void;
}

// === Root Component Props ===
export interface PlayableSpreadViewProps {
  mode: OperationMode;
  spreads: PlayableSpread[];
  assets?: RemixAsset[];
  selectedItemId?: string | null;
  selectedItemType?: ItemType | null;
  onItemSelect?: (itemType: ItemType | null, itemId: string | null) => void;
  onAssetSwap?: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
  onSpreadSelect?: (spreadId: string) => void;
  onPreview?: () => void;
  onStopPreview?: () => void;
}

// === Child Component Props ===
export interface PlayableHeaderProps {
  activeCanvas: ActiveCanvas;
  playMode: PlayMode;
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  onPlay: () => void;
  onStop: () => void;
}

export interface PlayableThumbnailListProps {
  spreads: PlayableSpread[];
  selectedId: string | null;
  onSpreadClick: (spreadId: string) => void;
}

// === Canvas Props ===
export interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  zoomLevel: number;
  selectedItemId?: string | null;
  selectedItemType?: ItemType | null;
  onItemSelect: (itemType: ItemType | null, itemId: string | null) => void;
}

export interface RemixEditorCanvasProps {
  spread: PlayableSpread;
  zoomLevel: number;
  assets: RemixAsset[];
  onAssetSwap: (params: AssetSwapParams) => Promise<void>;
  onTextChange?: (textboxId: string, newText: string) => void;
}

export interface PlayerCanvasProps {
  spread: PlayableSpread;
  zoomLevel: number;
  playMode: PlayMode;
  hasNext: boolean;
  hasPrevious: boolean;
  onSpreadComplete: (spreadId: string) => void;
  onSkipSpread: (direction: 'next' | 'prev') => void;
  onPlayModeChange: (mode: PlayMode) => void;
}

export interface PlayerControlSidebarProps {
  onPlayModeChange: (mode: PlayMode) => void;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  canBack: boolean;
}
