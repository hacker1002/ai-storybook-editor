// props-tab.tsx — Props section. Renders one PropSwapRow per book-allowed prop.
// Items library not shipped yet → rows render with empty options + disabled Swap.

import type { RemixPropEntry } from '@/types/editor';
import type { RemixPropChoice } from '@/types/remix';
import { PropSwapRow } from './prop-swap-row';

interface Props {
  allowedProps: RemixPropEntry[];
  draftProps: RemixPropChoice[];
  onUpsert: (key: string, patch: Partial<RemixPropChoice>) => void;
}

export function PropsTab({ allowedProps, draftProps, onUpsert }: Props) {
  if (allowedProps.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No props enabled in book remix settings.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {allowedProps.map((bookProp) => (
        <PropSwapRow
          key={bookProp.key}
          bookProp={bookProp}
          entry={draftProps.find((p) => p.key === bookProp.key)}
          onUpsert={(patch) => onUpsert(bookProp.key, patch)}
        />
      ))}
    </div>
  );
}
