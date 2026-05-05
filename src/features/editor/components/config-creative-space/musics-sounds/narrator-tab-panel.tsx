// narrator-tab-panel.tsx
// NARRATOR tab — single volume slider for narrator playback.

import * as React from 'react';

import { VolumeSlider } from './volume-slider';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export interface NarratorTabPanelProps {
  volume: number;
  onChange: (v: number) => void;
}

export function NarratorTabPanel({ volume, onChange }: NarratorTabPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel>Narrator Volume</FieldLabel>
        <VolumeSlider value={volume} onChange={onChange} ariaLabel="Narrator volume" />
      </div>
    </div>
  );
}
