import type { Language, IconRailItemConfig, PipelineStep } from '@/types/editor';

// Available languages for editor
export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en_US', name: 'English (US)' },
  { code: 'vi_VN', name: 'Tiếng Việt' },
  { code: 'ja_JP', name: '日本語' },
  { code: 'ko_KR', name: '한국어' },
  { code: 'zh_CN', name: '中文 (简体)' },
];

export const DEFAULT_LANGUAGE: Language = AVAILABLE_LANGUAGES[0];

// Pipeline steps configuration
export const PIPELINE_STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'manuscript', label: 'Manuscript' },
  { key: 'illustration', label: 'Illustration' },
  { key: 'retouch', label: 'Retouch' },
];

// Manuscript step icons
export const MANUSCRIPT_ICONS: IconRailItemConfig[] = [
  { id: 'doc', icon: 'FileText', label: 'Document' },
  { id: 'dummy', icon: 'LayoutGrid', label: 'Dummy Layout' },
  { id: 'sketch', icon: 'Pencil', label: 'Sketch' },
];

// Illustration step icons
export const ILLUSTRATION_ICONS: IconRailItemConfig[] = [
  { id: 'character', icon: 'Smile', label: 'Characters' },
  { id: 'prop', icon: 'Box', label: 'Props' },
  { id: 'stage', icon: 'Mountain', label: 'Stages' },
  { id: 'spread', icon: 'BookOpen', label: 'Spreads' },
];

// Retouch step icons
export const RETOUCH_ICONS: IconRailItemConfig[] = [
  { id: 'object', icon: 'Layers', label: 'Objects' },
  { id: 'animation', icon: 'Zap', label: 'Animations' },
  { id: 'remix', icon: 'RefreshCw', label: 'Remix' },
];

// Default icons (bottom section, always visible)
export const DEFAULT_ICONS: IconRailItemConfig[] = [
  { id: 'history', icon: 'History', label: 'History' },
  { id: 'flag', icon: 'Flag', label: 'Flags' },
  { id: 'share', icon: 'Share2', label: 'Share Links' },
  { id: 'collaborator', icon: 'Users', label: 'Collaborators' },
];

// Settings icon (isolated at bottom)
export const SETTING_ICON: IconRailItemConfig = {
  id: 'setting',
  icon: 'Settings',
  label: 'Settings',
};

// Step to icons mapping
export const STEP_ICONS: Record<PipelineStep, IconRailItemConfig[]> = {
  manuscript: MANUSCRIPT_ICONS,
  illustration: ILLUSTRATION_ICONS,
  retouch: RETOUCH_ICONS,
};

// Helper: get icons for current step
export function getIconsForStep(step: PipelineStep): IconRailItemConfig[] {
  return STEP_ICONS[step] ?? MANUSCRIPT_ICONS;
}

// Helper: get default creative space for step
export function getDefaultCreativeSpace(step: PipelineStep): string {
  const icons = STEP_ICONS[step];
  return icons?.[0]?.id ?? 'doc';
}

// Brief attribute options - re-export from book-enums for backwards compatibility
export {
  TARGET_AUDIENCE_OPTIONS as TARGET_AUDIENCES,
  TARGET_CORE_VALUE_OPTIONS as CORE_VALUES,
  FORMAT_GENRE_OPTIONS as FORMAT_GENRES,
  CONTENT_GENRE_OPTIONS as CONTENT_GENRES,
  BOOK_TYPE_OPTIONS,
  DIMENSION_OPTIONS,
  WRITING_STYLE_OPTIONS,
} from './book-enums';
