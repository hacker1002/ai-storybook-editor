import type { Sound, SoundsFilterState } from '@/types/sound';

export function soundTags(s: Sound): string[] {
  return (s.tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function matchSearch(s: Sound, needle: string): boolean {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    s.name.toLowerCase().includes(n) ||
    (s.description ?? '').toLowerCase().includes(n) ||
    soundTags(s).some((t) => t.includes(n))
  );
}

export function applyFilters(sounds: Sound[], f: SoundsFilterState): Sound[] {
  return sounds.filter((s) => {
    if (f.search && !matchSearch(s, f.search)) return false;
    if (f.source !== null && s.source !== f.source) return false;
    if (f.type !== null) {
      const isLoop = s.loop === true;
      if (f.type === 'loop' && !isLoop) return false;
      if (f.type === 'one_shot' && isLoop) return false;
    }
    if (f.tags.length > 0) {
      const tagsOfSound = soundTags(s);
      const allMatch = f.tags.every((wanted) => tagsOfSound.includes(wanted.toLowerCase()));
      if (!allMatch) return false;
    }
    if (f.durationRange) {
      const [lo, hi] = f.durationRange;
      if (s.duration < lo || s.duration > hi) return false;
    }
    return true;
  });
}

export function distinctTags(sounds: Sound[]): string[] {
  const set = new Set<string>();
  for (const s of sounds) for (const t of soundTags(s)) set.add(t);
  return Array.from(set).sort();
}

export function durationBounds(sounds: Sound[]): [number, number] {
  if (sounds.length === 0) return [0, 0];
  let min = sounds[0].duration;
  let max = sounds[0].duration;
  for (const s of sounds) {
    if (s.duration < min) min = s.duration;
    if (s.duration > max) max = s.duration;
  }
  return [min, max];
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
