import type { AudioResource, AudioFilterState } from '../types';

export function audioTags(item: AudioResource): string[] {
  return (item.tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function matchSearch(item: AudioResource, needle: string): boolean {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    item.name.toLowerCase().includes(n) ||
    (item.description ?? '').toLowerCase().includes(n) ||
    audioTags(item).some((t) => t.includes(n))
  );
}

export function applyFilters(
  items: AudioResource[],
  f: AudioFilterState,
): AudioResource[] {
  return items.filter((item) => {
    if (f.search && !matchSearch(item, f.search)) return false;
    if (f.source !== null && item.source !== f.source) return false;
    if (f.type !== null) {
      const isLoop = item.loop === true;
      if (f.type === 'loop' && !isLoop) return false;
      if (f.type === 'one_shot' && isLoop) return false;
    }
    if (f.tags.length > 0) {
      const tagsOf = audioTags(item);
      const allMatch = f.tags.every((wanted) => tagsOf.includes(wanted.toLowerCase()));
      if (!allMatch) return false;
    }
    if (f.durationRange) {
      const [lo, hi] = f.durationRange;
      if (item.duration < lo || item.duration > hi) return false;
    }
    return true;
  });
}

export function distinctTags(items: AudioResource[]): string[] {
  const set = new Set<string>();
  for (const item of items) for (const t of audioTags(item)) set.add(t);
  return Array.from(set).sort();
}

export function durationBoundsOf(items: AudioResource[]): [number, number] {
  if (items.length === 0) return [0, 0];
  let min = items[0].duration;
  let max = items[0].duration;
  for (const item of items) {
    if (item.duration < min) min = item.duration;
    if (item.duration > max) max = item.duration;
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
