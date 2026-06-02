// checkbox.tsx — Square checkbox primitive. Button-based (Space/Enter toggle
// via native button semantics + role="checkbox" + aria-checked). Pairs with
// Switch.tsx visually-but-semantically distinct: use Checkbox for multi-select
// / boolean attribute, Switch for instant-effect on/off (e.g., dark mode).

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/utils';

export interface CheckboxProps {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (next: boolean) => void;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      checked,
      disabled,
      onCheckedChange,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
    },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input hover:bg-accent',
        className,
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
    </button>
  ),
);
Checkbox.displayName = 'Checkbox';
