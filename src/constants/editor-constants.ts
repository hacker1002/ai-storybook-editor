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

// Brief attribute options
export const TARGET_AUDIENCES = [
  { value: '0-3', label: '0-3 years (Infants/Toddlers)' },
  { value: '3-5', label: '3-5 years (Preschool)' },
  { value: '5-8', label: '5-8 years (Early Readers)' },
  { value: '8-12', label: '8-12 years (Middle Grade)' },
  { value: '12+', label: '12+ years (Young Adult)' },
];

export const CORE_VALUES = [
  { value: 'kindness', label: 'Kindness' },
  { value: 'courage', label: 'Courage' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'curiosity', label: 'Curiosity' },
  { value: 'perseverance', label: 'Perseverance' },
  { value: 'creativity', label: 'Creativity' },
  { value: 'honesty', label: 'Honesty' },
  { value: 'empathy', label: 'Empathy' },
];

export const FORMAT_GENRES = [
  { value: 'picture-book', label: 'Picture Book' },
  { value: 'board-book', label: 'Board Book' },
  { value: 'early-reader', label: 'Early Reader' },
  { value: 'chapter-book', label: 'Chapter Book' },
  { value: 'graphic-novel', label: 'Graphic Novel' },
  { value: 'interactive', label: 'Interactive Book' },
];

export const CONTENT_GENRES = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'educational', label: 'Educational' },
  { value: 'slice-of-life', label: 'Slice of Life' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'humor', label: 'Humor' },
  { value: 'sci-fi', label: 'Science Fiction' },
  { value: 'historical', label: 'Historical' },
];
