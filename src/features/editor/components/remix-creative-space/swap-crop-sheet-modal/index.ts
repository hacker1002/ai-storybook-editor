// Barrel for the swap-crop-sheet modal feature folder.
// Re-exports the public entry so external importers can use the folder path
// (`./swap-crop-sheet-modal`) unchanged after the structural consolidation.
// ⚡2026-06-12 — 4-tab pipeline: LottiesTab removed (deferred to its own
// modal); RmbgTab/UpscaleTab added; RemixModalTab is canonical in types/remix.
export { SwapCropSheetModal } from './swap-crop-sheet-modal';
export { RemixModalHeader } from './remix-modal-header';
export type { RemixModalTab } from '@/types/remix';
export { VariantsTab, type VariantsTabProps } from './tabs/variants-tab';
export { BatchesTab, type BatchesTabProps } from './tabs/batches-tab';
export { RmbgTab, type RmbgTabProps } from './tabs/rmbg-tab';
export { UpscaleTab, type UpscaleTabProps } from './tabs/upscale-tab';
