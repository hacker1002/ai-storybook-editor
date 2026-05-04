import type { AudioSource } from '../types';

export { formatDuration } from '@/utils/format-duration';

export const SOURCE_BADGE: Record<AudioSource, { label: string; iconName: 'Upload' | 'Sparkles' }> = {
  0: { label: 'UPLOAD', iconName: 'Upload' },
  1: { label: 'GENERATE', iconName: 'Sparkles' },
};

/** Format ms duration → "M:SS". */
export function formatDurationMs(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const totalSecs = Math.max(0, Math.round(safe / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
