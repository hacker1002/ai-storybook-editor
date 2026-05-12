// form-field.tsx — Compact label + control wrapper used across humans forms.

import type { ReactNode } from 'react';
import { cn } from '@/utils/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, required, error, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
