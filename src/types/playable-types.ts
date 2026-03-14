// playable-types.ts - Domain types for playable spread view (component Props stay in component)

import type { BaseSpread, SpreadAnimation } from './spread-types';

// === Player Phases ===
export type PlayerPhase = 'idle' | 'playing' | 'awaiting_next' | 'awaiting_click' | 'complete';

// === Animation Step ===
export interface AnimationStep {
  index: number;
  triggerType: 'on_next' | 'on_click' | 'auto';
  targetId?: string;
  clickLoop?: number;
  mustComplete: boolean;
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
  currentStepIndex: number;
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

// === Core Enums/Types ===
export type OperationMode = 'animation-editor' | 'remix-editor' | 'player';
export type ActiveCanvas = 'animation-editor' | 'remix-editor' | 'player';
export type PlayMode = 'off' | 'semi-auto' | 'auto';

// === PlayableSpread ===
export interface PlayableSpread extends BaseSpread {
  animations: SpreadAnimation[];
}

// === Remix Asset (align with DB schema) ===
export interface RemixAsset {
  name: string;
  key: string;
  type: 'character' | 'prop';
  image_url: string;
  target: {
    name: string;
    key: string;
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

// === Action Parameters ===
export interface AssetSwapParams {
  prompt: string;
  referenceImage: File | null;
  targetId: string;
  spreadId: string;
}

// Re-export spread types that playable consumers commonly need
export type { BaseSpread, SpreadAnimation };
