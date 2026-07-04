// text-settings-step-tabs.tsx
// Segmented tabs (SKETCH / ILLUSTRATION / RETOUCH) for ConfigTextSettings.
// Selects which step slice of book.typography[step][lang] the panel reads/writes.
// Local UI state — does not persist (default 'sketch').

import type { TypographyStep } from '@/types/editor';
import { cn } from '@/utils/utils';

interface StepTabDef {
  key: TypographyStep;
  label: string;
}

const STEP_TABS: ReadonlyArray<StepTabDef> = [
  { key: 'sketch', label: 'SKETCH' },
  { key: 'illustration', label: 'ILLUSTRATION' },
  { key: 'retouch', label: 'RETOUCH' },
];

export interface TextSettingsStepTabsProps {
  activeStep: TypographyStep;
  onStepChange: (step: TypographyStep) => void;
}

export function TextSettingsStepTabs({ activeStep, onStepChange }: TextSettingsStepTabsProps) {
  return (
    <div
      role="tablist"
      className="flex h-14 shrink-0 items-center gap-4 border-b px-4"
    >
      {STEP_TABS.map((tab) => {
        const isActive = tab.key === activeStep;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onStepChange(tab.key)}
            className={cn(
              'border-b-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
