import { getLanguageName } from '@/constants/config-constants';
import type { Voice, VoicesFilterState } from '@/types/voice';

export function voiceTags(v: Voice): string[] {
  return (v.tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function matchSearch(v: Voice, needle: string): boolean {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    v.name.toLowerCase().includes(n) ||
    (v.description ?? '').toLowerCase().includes(n) ||
    getLanguageName(v.language).toLowerCase().includes(n) ||
    voiceTags(v).some((t) => t.includes(n))
  );
}

export function applyFilters(voices: Voice[], f: VoicesFilterState): Voice[] {
  return voices.filter((v) => {
    if (f.type !== null && v.type !== f.type) return false;
    if (f.gender !== null && v.gender !== f.gender) return false;
    if (f.language !== null && v.language !== f.language) return false;
    if (f.tag !== null && !voiceTags(v).includes(f.tag)) return false;
    if (f.search && !matchSearch(v, f.search)) return false;
    return true;
  });
}

export function distinctLanguages(voices: Voice[]): string[] {
  const set = new Set<string>();
  for (const v of voices) if (v.language) set.add(v.language);
  return Array.from(set).sort();
}

export function distinctTags(voices: Voice[]): string[] {
  const set = new Set<string>();
  for (const v of voices) for (const t of voiceTags(v)) set.add(t);
  return Array.from(set).sort();
}

export function normalizeTags(csv: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of csv.split(',')) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out.join(',');
}
