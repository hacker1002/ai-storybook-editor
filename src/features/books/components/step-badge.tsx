// step-badge.tsx — Pill rendering STEP_META[step].label with tone-based color.
// Text label is the primary channel; color is supplementary (a11y-safe).
// Reused by BookRow (phase 02) + Book Details modal (phase 03) → own file.

import { cn } from '@/utils/utils';
import { PILL_BASE, STEP_META, TONE_CLASS } from '@/features/books/constants';
import type { BookStep } from '@/features/books/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'StepBadge');

interface StepBadgeProps {
  step: BookStep;
}

export function StepBadge({ step }: StepBadgeProps) {
  const meta = STEP_META[step];
  if (!meta) {
    // Defensive: book.step is SMALLINT 1|2|3, but guard against bad data.
    log.warn('render', 'unknown step, skipping badge', { step });
    return null;
  }
  return (
    <span className={cn(PILL_BASE, TONE_CLASS[meta.tone])}>{meta.label}</span>
  );
}
