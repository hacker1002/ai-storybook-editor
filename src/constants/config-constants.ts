// config-constants.ts — Constants for ConfigCreativeSpace settings panels.
// Sections, mappings, and default values used across all config components.

import type {
  TypographySettings,
  BranchTypographySettings,
  NarratorInferenceParams,
  NarratorSettings,
  BookMusicSettings,
  BookSoundSettings,
  BookEffectsSettings,
  TransitionType,
  BookRemix,
  CharacterRemixType,
  RemixLanguageCode,
} from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Utils', 'LanguageName');

// ── Section navigation ────────────────────────────────────────────────────────

export type ConfigSection =
  | 'general'
  | 'objects'
  | 'text'
  | 'narrator'
  | 'musics-sounds'
  | 'quiz'
  | 'branch'
  | 'layout'
  | 'effect'
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
  { key: 'general',        label: 'General',          icon: 'Settings'       },
  { key: 'objects',        label: 'Objects',          icon: 'Box'            },
  { key: 'text',           label: 'Text',             icon: 'Type'           },
  { key: 'narrator',       label: 'Narrator',         icon: 'AudioLines'     },
  { key: 'musics-sounds',  label: 'Musics & Sounds',  icon: 'Music'          },
  { key: 'quiz',           label: 'Quiz',             icon: 'HelpCircle'     },
  { key: 'branch',         label: 'Branch',           icon: 'GitBranch'      },
  { key: 'layout',         label: 'Layout',           icon: 'LayoutGrid'     },
  { key: 'effect',         label: 'Effect',           icon: 'Sparkles'       },
  { key: 'remix',          label: 'Remix',            icon: 'RefreshCw'      },
  { key: 'preview',        label: 'Preview',          icon: 'Eye'            },
  { key: 'export',         label: 'Export',           icon: 'Download'       },
  { key: 'print',          label: 'Print',            icon: 'Printer'        },
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

// ── Humans feature constants ─────────────────────────────────────────────────

export const SUPPORTED_COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'VN', label: 'Vietnam'       },
  { code: 'JP', label: 'Japan'         },
  { code: 'KR', label: 'South Korea'   },
  { code: 'CN', label: 'China'         },
] as const;

export function getCountryName(code: string | null | undefined): string {
  if (!code) return '';
  const entry = SUPPORTED_COUNTRIES.find(c => c.code === code);
  return entry?.label ?? code;
}

export const GENDER_OPTIONS = [
  { value: 'null', label: 'Unspecified' },
  { value: '0',    label: 'Female'      },
  { value: '1',    label: 'Male'        },
] as const;

export const VISUAL_PROFILE_TYPES = [
  { value: 'face',      label: 'Face'      },
  { value: 'full_body', label: 'Full body' },
] as const;

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

// ── Musics & Sounds settings ──────────────────────────────────────────────────

// Volume scale shared across music / sound / narrator panels (DB stores 0..2 float).
export const VOLUME_MIN = 0;     // 0%
export const VOLUME_MAX = 2;     // 200%
export const VOLUME_DEFAULT = 1; // 100%
export const VOLUME_STEP = 0.01; // 1% step

export const DEFAULT_BOOK_MUSIC: BookMusicSettings = {
  background_id: null,
  volume_scale: VOLUME_DEFAULT,
};

export const DEFAULT_BOOK_SOUND: BookSoundSettings = {
  transition_id: null,
  true_id: null,
  wrong_id: null,
  volume_scale: VOLUME_DEFAULT,
};

export const DEFAULT_NARRATOR_VOLUME = VOLUME_DEFAULT;

// Tab keys for ConfigMusicsSoundsSettings (local UI state, not persisted).
export type MusicsSoundsTab = 'music' | 'sound' | 'narrator';
export const MUSICS_SOUNDS_DEFAULT_TAB: MusicsSoundsTab = 'music';

/**
 * Preview texts per language (used by narrator voice preview cards).
 * MUST match backend `PREVIEW_TEXT_BY_LANGUAGE` byte-exact so SHA256 cache paths align.
 * Reference: ai-storybook-design/component/editor-page/config-creative-space/05-config-narrator-settings.md §3.4
 */
// ── Effect settings ──────────────────────────────────────────────────────────

// Display order matches design spec; default is 'turn'. UI lists shipped values only —
// player tolerates future enum extensions (falls back to 'turn' on unknown).
export const TRANSITION_OPTIONS: ReadonlyArray<{ value: TransitionType; label: string }> = [
  { value: 'parallax', label: 'Parallax' },
  { value: 'turn',     label: 'Turn'     },
  { value: 'slide',    label: 'Slide'    },
  { value: 'fade',     label: 'Fade'     },
  { value: 'flip',     label: 'Flip'     },
  { value: 'zoom',     label: 'Zoom'     },
] as const;

export const DEFAULT_EFFECTS: BookEffectsSettings = {
  transition_type: 'turn',
  gyroscope: false,
};

// ── Remix settings ────────────────────────────────────────────────────────

export const REMIX_LANGUAGES: ReadonlyArray<{ code: RemixLanguageCode; name: string; label: string }> = [
  { code: 'en_US', name: 'English',    label: 'English (en-US)'    },
  { code: 'vi_VN', name: 'Vietnamese', label: 'Vietnamese (vi-VN)' },
  { code: 'ja_JP', name: 'Japanese',   label: 'Japanese (ja-JP)'   },
  { code: 'ko_KR', name: 'Korean',     label: 'Korean (ko-KR)'     },
  { code: 'zh_CN', name: 'Chinese',    label: 'Chinese (zh-CN)'    },
] as const;

export const CHARACTER_TYPE_OPTIONS: ReadonlyArray<{ value: CharacterRemixType; label: string }> = [
  { value: 'body',   label: 'Body'           },
  { value: 'custom', label: 'Body & Customs' },
] as const;

export const DEFAULT_CHARACTER_REMIX_TYPE: CharacterRemixType = 'body';

export const DEFAULT_REMIX: BookRemix = {
  languages: [],
  narrator:  { is_enabled: false },
  characters: [],
  props:      [],
};

/**
 * Coerce raw `books.remix` JSONB into a full BookRemix shape.
 * Legacy rows may store partial shapes (missing narrator/arrays) — normalize
 * once at the store ingress so downstream consumers can trust the contract.
 * Returns null only when the raw value is null/undefined (preserves the
 * "remix not configured" empty-state branch).
 */
export function normalizeBookRemix(raw: unknown): BookRemix | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') {
    log.warn('normalizeBookRemix', 'unexpected non-object', { type: typeof raw });
    return null;
  }
  const r = raw as Partial<BookRemix>;
  return {
    languages:  Array.isArray(r.languages)  ? r.languages  : [],
    narrator:   r.narrator && typeof r.narrator === 'object'
                  ? { is_enabled: !!r.narrator.is_enabled }
                  : { is_enabled: false },
    characters: Array.isArray(r.characters) ? r.characters : [],
    props:      Array.isArray(r.props)      ? r.props      : [],
  };
}

// ── Preview texts ────────────────────────────────────────────────────────────

export const PREVIEW_TEXTS: Record<string, string> = {
  en_US: 'Once upon a time, in a land far away, a small dragon discovered a hidden secret that would change everything.',
  vi_VN: 'Ngày xửa ngày xưa, ở một vùng đất xa xôi, một chú rồng nhỏ đã phát hiện ra một bí mật ẩn giấu có thể thay đổi tất cả.',
  ja_JP: 'むかしむかし、遠い国に小さなドラゴンがいました。ある日、すべてを変える秘密を発見しました。',
  ko_KR: '옛날 옛적에, 먼 나라에 작은 용이 모든 것을 바꿀 숨겨진 비밀을 발견했습니다.',
  zh_CN: '很久很久以前，在一个遥远的地方，一条小龙发现了一个能改变一切的隐藏秘密。',
};
