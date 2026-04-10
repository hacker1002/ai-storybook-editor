import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a display name to a deterministic, Unicode-aware key.
 * Preserves Unicode letters/digits (Vietnamese, CJK, Arabic, etc.).
 * Example: nameToKey("Thanh kiếm") === "thanh_kiếm"
 */
export function nameToKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Check if a key already exists in a collection.
 * Example: isKeyTaken("hero", ["hero", "villain"]) === true
 */
export function isKeyTaken(key: string, existingKeys: string[]): boolean {
  return existingKeys.includes(key);
}
