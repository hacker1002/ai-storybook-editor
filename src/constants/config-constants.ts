// config-constants.ts — Constants for ConfigCreativeSpace settings panels.
// Sections, mappings, and default values used across all config components.

import type { TypographySettings, BranchTypographySettings } from '@/types/editor';
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
