// animations-creative-space barrel exports

// Types
export type {
  EffectCategory,
  TargetItemIcon,
  ResolvedAnimation,
  AnimationFilterState,
  ObjectFilterOption,
  AvailableEffect,
  SelectedItem,
  SpreadAnimation,
  Geometry,
  ItemType,
} from './animation-types';

// Constants
export {
  EFFECT_TYPE,
  EFFECT_TYPE_NAMES,
  EFFECT_CATEGORY_MAP,
  STAR_COLOR_MAP,
  EFFECT_OPTIONS_MAP,
  TARGET_ICON_MAP,
  TRIGGER_TYPE_LABELS,
  EFFECT_CATEGORY_LABELS,
  ALLOWED_EFFECTS_BY_TARGET,
  SIDEBAR_WIDTH,
} from './animation-constants';

// Utils
export {
  resolveAnimations,
  buildDefaultEffect,
  getAvailableEffects,
  buildObjectFilterOptions,
  filterAnimations,
  createDefaultFilterState,
} from './animation-utils';

// Components
export { AnimationFilterPopover } from './animation-filter-popover';
export { AnimationSettingsPanel } from './animation-settings-panel';
export { AnimationListItem } from './animation-list-item';
export { AnimationEditorSidebar } from './animation-editor-sidebar';
export { AnimationsCreativeSpace } from './animations-creative-space';
