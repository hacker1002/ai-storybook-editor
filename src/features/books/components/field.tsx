// field.tsx — Shared label+control wrapper for the books modals (NewBookModal +
// any future form). Renders a sentence-case, foreground-weighted label above the
// control. The label is associated to the control via `htmlFor`/`id` when an
// `htmlFor` prop is provided (text inputs); composite controls (Select/combobox)
// that own their own aria wiring can omit it and the label renders as a plain
// caption.

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FieldProps {
  label: string;
  /** When set, wires `<Label htmlFor>` ↔ the control's `id` (text inputs). */
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-sm font-semibold text-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
