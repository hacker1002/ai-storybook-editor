import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a display name to an ASCII-only, underscore-separated key.
 * Handles Latin scripts including Vietnamese diacritics (NFD decomposition + đ→d).
 * Non-ASCII input (CJK, Arabic, emoji, …) is stripped — caller must handle empty result
 * (see `create-asset-dialog.tsx` which surfaces "Invalid name" when key === '').
 *
 * Scope (v1): English and Vietnamese. Other scripts yield empty strings.
 * Matches backend `sanitizeStorageKey` transliteration rules in
 * `supabase/functions/_shared/validators.ts` for FE/BE consistency.
 *
 * Examples:
 *   nameToKey("Xin chào")   === "xin_chao"
 *   nameToKey("Đồng hồ")    === "dong_ho"
 *   nameToKey("Hero 01")    === "hero_01"
 *   nameToKey("你好")        === ""
 */
export function nameToKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Check if a key already exists in a collection.
 * Example: isKeyTaken("hero", ["hero", "villain"]) === true
 */
export function isKeyTaken(key: string, existingKeys: string[]): boolean {
  return existingKeys.includes(key);
}
