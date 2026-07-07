// user-form-field.tsx — Label + control wrapper shared by the Create and Edit
// user modals (reused ≥2 places).

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface UserFormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}

export function UserFormField({ label, htmlFor, required, children }: UserFormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
