// music-tab-panel.tsx
// MUSIC tab — pick background music + adjust music mixer volume.

import * as React from 'react';

import { DEFAULT_BOOK_MUSIC } from '@/constants/config-constants';
import type { BookMusicSettings } from '@/types/editor';
import type { Music } from '@/types/music';

import { AudioAssetSelector } from './audio-asset-selector';
import { VolumeSlider } from './volume-slider';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export interface MusicTabPanelProps {
  music: BookMusicSettings | null;
  musicsList: ReadonlyArray<Music>;
  onChange: (next: BookMusicSettings) => void;
}

export function MusicTabPanel({ music, musicsList, onChange }: MusicTabPanelProps) {
  const current = music ?? DEFAULT_BOOK_MUSIC;

  const handleBgChange = React.useCallback(
    (id: string | null) => onChange({ ...current, background_id: id }),
    [current, onChange],
  );

  const handleVolumeChange = React.useCallback(
    (v: number) => onChange({ ...current, volume_scale: v }),
    [current, onChange],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel>Background Music</FieldLabel>
        <AudioAssetSelector
          kind="music"
          value={current.background_id}
          options={musicsList}
          placeholder="Choose music option"
          onChange={handleBgChange}
        />
      </div>

      <div>
        <FieldLabel>Background Music Volume</FieldLabel>
        <VolumeSlider
          value={current.volume_scale}
          onChange={handleVolumeChange}
          ariaLabel="Background music volume"
        />
      </div>
    </div>
  );
}
