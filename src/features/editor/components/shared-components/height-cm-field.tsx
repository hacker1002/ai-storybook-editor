// height-cm-field.tsx — the "HEIGHT (CM)" input, shared by the two sketch text modals
// (EditBaseEntityModal tabs/entity · EditVariantModal single variant).
//
// Controlled from a RAW draft string ("" | "110") — never `defaultValue`: an uncontrolled input
// would not repaint on an entity-undo store restore. Draft conversions + validation live in
// `height-cm-draft.ts` (this file may export components only — react-refresh lint).
//
// `type="text"` + inputMode="numeric" — NOT type="number", deliberately. A number input reports
// value === '' for unparseable text ("abc") while still DISPLAYING it, which would both (a) make
// the empty draft indistinguishable from a cleared field and silently write null over a real
// height on Save, and (b) make the invalid hint unreachable for letters — the phase requires
// "chữ → border destructive + hint + Save disabled". A text input keeps the RAW string honest, so
// every invalid draft is visible AND blocks Save. inputMode keeps the numeric keypad on mobile.
//
// `height` does NOT drive generation (dropped from API 05/06) — it is metadata for the lineup.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/utils';
import { isHeightDraftValid } from '@/features/editor/components/shared-components/height-cm-draft';

export interface HeightCmFieldProps {
  /** RAW draft string — controlled by the owning modal's draft state. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** HEIGHT (CM) section — renders its own destructive border + inline hint when the draft is invalid. */
export function HeightCmField({ value, onChange, disabled }: HeightCmFieldProps) {
  const valid = isHeightDraftValid(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Height (cm)
      </Label>
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          className={cn('pr-9 text-sm', !valid && 'border-destructive focus-visible:ring-destructive')}
          value={value}
          placeholder="e.g. 110"
          aria-label="Height in centimeters"
          aria-invalid={!valid}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          cm
        </span>
      </div>
      {!valid && (
        <p className="text-xs text-destructive" role="alert">
          Height phải là số nguyên 1–5000 (cm)
        </p>
      )}
    </div>
  );
}
