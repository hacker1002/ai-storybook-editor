// voice-inference-params.types.ts
// Public types + re-exported constants for the shared `VoiceInferenceParams` component.
// Component is domain-agnostic; narrator-specific parent owns debounce/side-effects.

import type { NarratorInferenceParams } from '@/types/editor';

// Re-export constants from their canonical location so consumers only import from this barrel.
export { DEFAULT_INFERENCE_PARAMS, SPEED_OPTIONS } from '@/constants/config-constants';

/** Same shape as `NarratorInferenceParams` but named for the shared-component surface. */
export type VoiceInferenceParamsValue = NarratorInferenceParams;

export interface VoiceInferenceParamsProps {
  value: VoiceInferenceParamsValue;
  onChange: (next: VoiceInferenceParamsValue) => void;
  /** Called when user clicks Reset. If omitted, component falls back to `onChange(DEFAULT_INFERENCE_PARAMS)`. */
  onReset?: () => void;
  /** Show the Reset link. Default true. */
  showReset?: boolean;
  /** Disable all controls. Default false. */
  disabled?: boolean;
  /** Optional section title rendered above the controls. */
  title?: string;
  /** Layout override. */
  className?: string;
  /**
   * Hide the `speaker_boost` switch. Default `false` (BC: narrator/character preview keep switch).
   * The narration modal (per-chunk) uses `true` because the new schema dropped speaker_boost.
   */
  omitSpeakerBoost?: boolean;
}
