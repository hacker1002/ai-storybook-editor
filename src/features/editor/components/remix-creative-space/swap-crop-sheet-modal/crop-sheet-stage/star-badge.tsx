// star-badge.tsx — ★ marker for `is_final=true` crops owned by the current
// batch. Top-left, zoom-independent, never interactive. Subtle accent so the
// owned-current state reads as "this batch holds the final" without competing
// with the rev6 selection checkbox top-right.
//
// a11y: presentation-only (decorative); the real semantics come from any
// surrounding tooltip / live region the parent provides.

import { Star } from 'lucide-react';
import { cn } from '@/utils/utils';

interface StarBadgeProps {
  className?: string;
}

export function StarBadge({ className }: StarBadgeProps) {
  return (
    <span
      aria-hidden="true"
      title="Final crop owned by current batch"
      className={cn(
        'pointer-events-none absolute left-1 top-1 z-30',
        'flex h-[22px] w-[22px] items-center justify-center',
        'rounded-md bg-[#3b6cf6]/85 text-white shadow-sm',
        className,
      )}
    >
      <Star className="h-3.5 w-3.5 fill-current" />
    </span>
  );
}
