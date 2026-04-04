// config-constants.ts — Constants for ConfigCreativeSpace settings panels.
// Sections, mappings, and default values used across all config components.

import type { TypographySettings, BranchTypographySettings } from '@/types/editor';

// ── Section navigation ────────────────────────────────────────────────────────

export type ConfigSection =
  | 'general'
  | 'objects'
  | 'narration'
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
  { key: 'general',   label: 'General',   icon: 'Settings'       },
  { key: 'objects',   label: 'Objects',   icon: 'Box'            },
  { key: 'narration', label: 'Narration', icon: 'Mic'            },
  { key: 'quiz',      label: 'Quiz',      icon: 'HelpCircle'     },
  { key: 'branch',    label: 'Branch',    icon: 'GitBranch'      },
  { key: 'layout',    label: 'Layout',    icon: 'LayoutGrid'     },
  { key: 'remix',     label: 'Remix',     icon: 'RefreshCw'      },
  { key: 'preview',   label: 'Preview',   icon: 'Eye'            },
  { key: 'export',    label: 'Export',    icon: 'Download'       },
  { key: 'print',     label: 'Print',     icon: 'Printer'        },
];

// ── Object settings ───────────────────────────────────────────────────────────

export const OUTLINE_STYLES = [
  { value: 0, label: 'Solid'  },
  { value: 1, label: 'Dashed' },
  { value: 2, label: 'Dotted' },
] as const;

// ── General settings ──────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  { code: 'en_US', label: 'English (US)'       },
  { code: 'vi_VN', label: 'Vietnamese (VI-VN)' },
  { code: 'ja_JP', label: 'Japanese (JA-JP)'   },
  { code: 'ko_KR', label: 'Korean (KO-KR)'     },
  { code: 'zh_CN', label: 'Chinese (ZH-CN)'    },
] as const;

// ── Narration settings ────────────────────────────────────────────────────────

export const NARRATION_LANGUAGES = [
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
