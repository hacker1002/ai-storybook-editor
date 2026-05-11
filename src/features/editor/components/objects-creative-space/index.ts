export { ObjectsCreativeSpace } from './objects-creative-space';

// Animation editor sidebar components (relocated from animations-creative-space — ADR-028)
export { AnimationEditorSidebar } from './animation-editor-sidebar';
export { AnimationFilterPopover } from './animation-filter-popover';
export { AnimationListItem } from './animation-list-item';
export { AnimationSettingsPanel } from './animation-settings-panel';
export { EffectTypeGrid } from './effect-type-grid';

// Animation utils (relocated from animations-creative-space/utils.ts — ADR-028)
export {
  resolveAnimations,
  buildDefaultEffect,
  getAvailableEffects,
  buildObjectFilterOptions,
  filterAnimations,
  createDefaultFilterState,
  computeStepNumbers,
  buildItemsMap,
  inferEffectTypeForComposite,
} from './animation-utils';
