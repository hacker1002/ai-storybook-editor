// index.ts — Barrel for the GenerateNarrationModal folder.

export { GenerateNarrationModal } from './generate-narration-modal';
export type { GenerateNarrationModalProps } from './generate-narration-modal';
export { DEFAULT_SETTINGS } from './helpers/settings-mapper';
export {
  probeAudioDuration,
  sha256HexOfFile,
} from './helpers/upload-audio-helpers';
