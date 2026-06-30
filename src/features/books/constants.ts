// Books feature — step mapping + filter defaults.
// Step value stays `number` (never stringified) to match `book.step` SMALLINT.

import type { BookStep, BookStepTone, StepFilter, BooksFilterState } from './types';

export const STEP_META: Record<BookStep, { label: string; tone: BookStepTone }> = {
  1: { label: 'Sketch', tone: 'sketch' },
  2: { label: 'Illustration', tone: 'illustration' },
  3: { label: 'Retouch', tone: 'retouch' },
};

export const TONE_CLASS: Record<BookStepTone, string> = {
  sketch: 'bg-muted text-muted-foreground',
  illustration: 'bg-blue-100 text-blue-700',
  retouch: 'bg-green-100 text-green-700',
};

export const PILL_BASE =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export const STEP_OPTIONS: Array<{ value: StepFilter; label: string }> = [
  { value: 'all', label: 'All Steps' },
  { value: 1, label: STEP_META[1].label },
  { value: 2, label: STEP_META[2].label },
  { value: 3, label: STEP_META[3].label },
];

export const DEFAULT_BOOKS_FILTERS: BooksFilterState = { search: '', step: 'all' };

export const SEARCH_DEBOUNCE_MS = 200;
