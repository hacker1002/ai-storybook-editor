// config-effect-settings.tsx - Effect settings panel.
// Persists book.effects { transition_type, gyroscope }. Gyroscope is persistence-only
// this phase — player runtime hook will land later. UI lists shipped transition values;
// player tolerates unknown values by falling back to 'turn'.

import * as React from 'react';
import { useCurrentBook, useBookEffects, useBookActions } from '@/stores/book-store';
import { SearchableDropdown } from '@/components/ui/searchable-dropdown';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_EFFECTS, TRANSITION_OPTIONS } from '@/constants/config-constants';
import type { BookEffectsSettings, TransitionType } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigEffectSettings');

const TRANSITION_DROPDOWN_OPTIONS = TRANSITION_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function isTransitionType(value: string): value is TransitionType {
  return TRANSITION_OPTIONS.some((o) => o.value === value);
}

export function ConfigEffectSettings() {
  const book = useCurrentBook();
  const effects = useBookEffects();
  const { updateBook } = useBookActions();

  const current: BookEffectsSettings = effects ?? DEFAULT_EFFECTS;

  if (!book) return null;

  const persist = (next: BookEffectsSettings) => {
    log.debug('persist', 'updating effects', { ...next });
    void updateBook(book.id, { effects: next });
  };

  const handleTransitionChange = (value: string) => {
    if (!isTransitionType(value)) {
      log.warn('handleTransitionChange', 'rejected unknown value', { value });
      return;
    }
    log.info('handleTransitionChange', 'updating', { transition_type: value });
    persist({ ...current, transition_type: value });
  };

  const handleGyroscopeChange = (checked: boolean) => {
    log.info('handleGyroscopeChange', 'updating', { gyroscope: checked });
    persist({ ...current, gyroscope: checked });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Effect Settings</h3>
      </div>
      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <div>
          <GroupHeader>Transition</GroupHeader>
          <SearchableDropdown
            options={TRANSITION_DROPDOWN_OPTIONS}
            value={current.transition_type}
            onChange={handleTransitionChange}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between">
          <GroupHeader>Gyroscope</GroupHeader>
          <Switch
            checked={current.gyroscope}
            onCheckedChange={handleGyroscopeChange}
            aria-label="Toggle gyroscope effect"
          />
        </div>
      </div>
    </div>
  );
}
