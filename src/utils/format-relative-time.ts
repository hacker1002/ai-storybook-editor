// Shared relative-time formatter (DRY: replaces inline copies in story-card.tsx
// and audio-job-badge.tsx). Escalating ladder: Just now → minutes → hours →
// Yesterday → days → weeks → months → years. Invalid input → '' + warn.

import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'RelativeTime');

const SEC = 1;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

/**
 * Format an ISO timestamp as a human relative-time string.
 * @returns formatted string, or '' when `iso` cannot be parsed.
 */
export function formatRelativeTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    log.warn('formatRelativeTime', 'unparseable timestamp', { iso });
    return '';
  }

  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));

  if (diffSec < MIN) return 'Just now';
  if (diffSec < HOUR) return plural(Math.floor(diffSec / MIN), 'minute');
  if (diffSec < DAY) return plural(Math.floor(diffSec / HOUR), 'hour');

  const days = Math.floor(diffSec / DAY);
  if (days === 1) return 'Yesterday';
  if (diffSec < WEEK) return `${days} days ago`;
  if (diffSec < MONTH) return plural(Math.floor(diffSec / WEEK), 'week');
  if (diffSec < YEAR) return plural(Math.floor(diffSec / MONTH), 'month');
  return plural(Math.floor(diffSec / YEAR), 'year');
}
