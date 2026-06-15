import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('formatRelativeTime', () => {
  it("under a minute → 'Just now'", () => {
    expect(formatRelativeTime(isoAgo(10 * SEC))).toBe('Just now');
  });

  it('minutes (singular + plural)', () => {
    expect(formatRelativeTime(isoAgo(1 * MIN))).toBe('1 minute ago');
    expect(formatRelativeTime(isoAgo(5 * MIN))).toBe('5 minutes ago');
  });

  it('hours', () => {
    expect(formatRelativeTime(isoAgo(3 * HOUR))).toBe('3 hours ago');
  });

  it("exactly one day → 'Yesterday'", () => {
    expect(formatRelativeTime(isoAgo(DAY + HOUR))).toBe('Yesterday');
  });

  it('days', () => {
    expect(formatRelativeTime(isoAgo(3 * DAY))).toBe('3 days ago');
  });

  it('months', () => {
    expect(formatRelativeTime(isoAgo(60 * DAY))).toBe('2 months ago');
  });

  it('years', () => {
    expect(formatRelativeTime(isoAgo(400 * DAY))).toBe('1 year ago');
  });

  it("unparseable timestamp → ''", () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });
});
