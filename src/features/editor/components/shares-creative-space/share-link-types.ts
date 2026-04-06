// Types and constants for the SharesCreativeSpace feature.
// Scoped to this component — if needed elsewhere, migrate to src/types/.

// --- DB model ---

export interface ShareLink {
  id: string;
  user_id: string;
  book_id: string;
  name: string;
  url: string;           // slug (e.g., "abc123ef")
  privacy: SharePrivacy;
  passcode: string | null; // bcrypt hash, null if public
  editions: ShareEditions;
  languages: ShareLanguage[];
  created_at: string;
  updated_at: string;
}

export type SharePrivacy = 1 | 2; // 1: public, 2: private

export interface ShareEditions {
  classic?: boolean;
  dynamic?: boolean;
  interactive?: boolean;
}

export interface ShareLanguage {
  name: string;
  code: string;
}

// Payload sent from detail panel — plaintext passcode (parent hashes before DB)
export interface ShareLinkUpdatePayload {
  name?: string;
  editions?: ShareEditions;
  languages?: ShareLanguage[];
  privacy?: SharePrivacy;
  passcode?: string; // plaintext — hook hashes with bcrypt before saving
}

// --- Constants ---

export const PRIVACY_OPTIONS = [
  { value: 1 as SharePrivacy, label: 'Public - Anyone can view, discoverable in community' },
  { value: 2 as SharePrivacy, label: 'Private - Requires link and passcode' },
] as const;

export const EDITION_OPTIONS = [
  { key: 'classic' as const, label: 'Classic' },
  { key: 'dynamic' as const, label: 'Dynamic' },
  { key: 'interactive' as const, label: 'Interactive' },
] as const;

export const LANGUAGE_OPTIONS: ShareLanguage[] = [
  { name: 'English', code: 'en_US' },
  { name: 'Vietnamese', code: 'vi_VN' },
  { name: 'Japanese', code: 'ja_JP' },
  { name: 'Korean', code: 'ko_KR' },
  { name: 'Chinese', code: 'zh_CN' },
];

export const DEFAULT_SHARE_LINK = {
  name: 'Untitled Link',
  privacy: 1 as SharePrivacy,
  passcode: null,
  editions: {} as ShareEditions,
  languages: [] as ShareLanguage[],
};
