// sound-tab-panel.tsx
// SOUND tab — SFX mixer volume + transition/true/wrong sound pickers.

import * as React from 'react';

import { DEFAULT_BOOK_SOUND } from '@/constants/config-constants';
import type { BookSoundSettings } from '@/types/editor';
import type { Sound } from '@/types/sound';

import { AudioAssetSelector } from './audio-asset-selector';
import { VolumeSlider } from './volume-slider';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export interface SoundTabPanelProps {
  sound: BookSoundSettings | null;
  soundsList: ReadonlyArray<Sound>;
  onChange: (next: BookSoundSettings) => void;
}

export function SoundTabPanel({ sound, soundsList, onChange }: SoundTabPanelProps) {
  const current = sound ?? DEFAULT_BOOK_SOUND;

  const handleVolume = React.useCallback(
    (v: number) => onChange({ ...current, volume_scale: v }),
    [current, onChange],
  );
  const handleTransition = React.useCallback(
    (id: string | null) => onChange({ ...current, transition_id: id }),
    [current, onChange],
  );
  const handleTrue = React.useCallback(
    (id: string | null) => onChange({ ...current, true_id: id }),
    [current, onChange],
  );
  const handleWrong = React.useCallback(
    (id: string | null) => onChange({ ...current, wrong_id: id }),
    [current, onChange],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel>Sound Effect Volume</FieldLabel>
        <VolumeSlider
          value={current.volume_scale}
          onChange={handleVolume}
          ariaLabel="Sound effect volume"
        />
      </div>

      <div>
        <FieldLabel>Transition Sound</FieldLabel>
        <AudioAssetSelector
          kind="sound"
          value={current.transition_id}
          options={soundsList}
          placeholder="Choose transition sound"
          onChange={handleTransition}
        />
      </div>

      <div>
        <FieldLabel>True Sound</FieldLabel>
        <AudioAssetSelector
          kind="sound"
          value={current.true_id}
          options={soundsList}
          placeholder="Choose true sound"
          onChange={handleTrue}
        />
      </div>

      <div>
        <FieldLabel>Wrong Sound</FieldLabel>
        <AudioAssetSelector
          kind="sound"
          value={current.wrong_id}
          options={soundsList}
          placeholder="Choose wrong sound"
          onChange={handleWrong}
        />
      </div>
    </div>
  );
}
