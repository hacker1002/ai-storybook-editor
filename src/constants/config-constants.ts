// config-constants.ts — Constants for ConfigCreativeSpace settings panels.
// Sections, mappings, and default values used across all config components.

import type {
  TypographySettings,
  BranchTypographySettings,
  NarratorInferenceParams,
  NarratorSettings,
} from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Utils', 'LanguageName');

// ── Section navigation ────────────────────────────────────────────────────────

export type ConfigSection =
  | 'general'
  | 'objects'
  | 'text'
  | 'narrator'
  | 'quiz'
  | 'branch'
  | 'layout'
  | 'remix'
  | 'preview'
  | 'export'
  | 'print';

export interface ConfigSectionItem {
  key: ConfigSection;
  label: string;
  icon: string; // lucide-react icon name
}

export const CONFIG_SECTIONS: ConfigSectionItem[] = [
  { key: 'general',  label: 'General',  icon: 'Settings'       },
  { key: 'objects',  label: 'Objects',  icon: 'Box'            },
  { key: 'text',     label: 'Text',     icon: 'Type'           },
  { key: 'narrator', label: 'Narrator', icon: 'AudioLines'     },
  { key: 'quiz',     label: 'Quiz',     icon: 'HelpCircle'     },
  { key: 'branch',   label: 'Branch',   icon: 'GitBranch'      },
  { key: 'layout',   label: 'Layout',   icon: 'LayoutGrid'     },
  { key: 'remix',    label: 'Remix',    icon: 'RefreshCw'      },
  { key: 'preview',  label: 'Preview',  icon: 'Eye'            },
  { key: 'export',   label: 'Export',   icon: 'Download'       },
  { key: 'print',    label: 'Print',    icon: 'Printer'        },
];

// ── Object settings ───────────────────────────────────────────────────────────

export const OUTLINE_STYLES = [
  { value: 0, label: 'Solid'  },
  { value: 1, label: 'Dashed' },
  { value: 2, label: 'Dotted' },
] as const;

// ── General settings ──────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  { code: 'en_US', label: 'English (US)',       name: 'English'    },
  { code: 'vi_VN', label: 'Vietnamese (VI-VN)', name: 'Tiếng Việt' },
  { code: 'ja_JP', label: 'Japanese (JA-JP)',   name: '日本語'        },
  { code: 'ko_KR', label: 'Korean (KO-KR)',     name: '한국어'        },
  { code: 'zh_CN', label: 'Chinese (ZH-CN)',    name: '中文'         },
] as const;

export function getLanguageName(code: string): string {
  const entry = SUPPORTED_LANGUAGES.find(l => l.code === code);
  if (!entry) {
    log.warn('getLanguageName', 'unknown code, returning raw', { code });
    return code;
  }
  return entry.name;
}

export const TARGET_AUDIENCE_LABELS: Record<number, string> = {
  1: 'Kindergarten (ages 2-3)',
  2: 'Preschool (ages 4-5)',
  3: 'Primary (ages 6-8)',
  4: 'Middle grade (ages 9+)',
};

// ── Text / Narrator settings (shared 5-language list) ────────────────────────

export const TEXT_LANGUAGES = [
  { code: 'en_US', label: 'English (EN-US)'      },
  { code: 'vi_VN', label: 'Vietnamese (VI-VN)'   },
  { code: 'ja_JP', label: 'Japanese (JA-JP)'     },
  { code: 'ko_KR', label: 'Korean (KO-KR)'       },
  { code: 'zh_CN', label: 'Chinese (ZH-CN)'      },
] as const;

export const FONT_FAMILY_OPTIONS = [
  'Nunito',
  'Lato',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
] as const;

export const DEFAULT_BRANCH_TYPOGRAPHY: BranchTypographySettings = {
  family: 'Nunito',
  size: 18,
  color: '#000000',
};

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  size: 18,
  weight: 400,
  style: 'normal',
  family: 'Nunito',
  color: '#000000',
  line_height: 1.5,
  letter_spacing: 0,
  decoration: 'none',
  text_align: 'left',
  text_transform: 'none',
};

// ── Narrator settings ────────────────────────────────────────────────────────
// Reuses TEXT_LANGUAGES (same 5 languages); re-exported for clarity at import site.
export const NARRATOR_LANGUAGES = TEXT_LANGUAGES;

// Alias for character voice setting (same 5 languages).
export const VOICE_LANGUAGES = TEXT_LANGUAGES;

// UI speed options (API accepts continuous [0.7, 1.2]; UI is coarse).
export const SPEED_OPTIONS = [0.7, 1.0, 1.2] as const;

// Language keys inside `books.narrator` JSONB match this regex; anything else is a literal setting key.
export const NARRATOR_LANGUAGE_KEY_REGEX = /^[a-z]{2}_[A-Z]{2}$/;

export const DEFAULT_INFERENCE_PARAMS: NarratorInferenceParams = {
  speed: 1.0,
  stability: 0.5,
  similarity: 0.75,
  exaggeration: 0,
  speaker_boost: true,
};

export const DEFAULT_NARRATOR: NarratorSettings = {
  model: 'eleven_v3',
  ...DEFAULT_INFERENCE_PARAMS,
};

/**
 * Preview texts per language (used by narrator voice preview cards).
 * MUST match backend `PREVIEW_TEXT_BY_LANGUAGE` byte-exact so SHA256 cache paths align.
 * Reference: ai-storybook-design/component/editor-page/config-creative-space/05-config-narrator-settings.md §3.4
 */
export const PREVIEW_TEXTS: Record<string, string> = {
  en_US: 'Once upon a time, in a land far away, a small dragon discovered a hidden secret that would change everything.',
  vi_VN: 'Ngày xửa ngày xưa, ở một vùng đất xa xôi, một chú rồng nhỏ đã phát hiện ra một bí mật ẩn giấu có thể thay đổi tất cả.',
  ja_JP: 'むかしむかし、遠い国に小さなドラゴンがいました。ある日、すべてを変える秘密を発見しました。',
  ko_KR: '옛날 옛적에, 먼 나라에 작은 용이 모든 것을 바꿀 숨겨진 비밀을 발견했습니다.',
  zh_CN: '很久很久以前，在一个遥远的地方，一条小龙发现了一个能改变一切的隐藏秘密。',
};
