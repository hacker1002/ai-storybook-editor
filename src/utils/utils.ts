import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Generate a URL-safe unique key from a display name */
export function generateUniqueKey(name: string): string {
  return (
    name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36)
  );
}
