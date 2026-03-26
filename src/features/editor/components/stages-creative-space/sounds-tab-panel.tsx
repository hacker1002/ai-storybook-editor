// sounds-tab-panel.tsx - Lists all stage sounds as flat items (no accordion)

import { useState } from 'react';
import { useSnapshotActions } from '@/stores/snapshot-store/selectors';
import type { StageSound } from '@/types/stage-types';
import { StageSoundItem } from './sound-item';
import { SoundLibraryModal, type LibrarySound } from '@/features/editor/components/shared-components';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'StageSoundsTabPanel');

interface StageSoundsTabPanelProps {
  stageKey: string;
  sounds: StageSound[];
}

export function StageSoundsTabPanel({ stageKey, sounds }: StageSoundsTabPanelProps) {
  log.debug('render', 'init', { stageKey, count: sounds.length });

  const { updateStageSound } = useSnapshotActions();
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browseSoundKey, setBrowseSoundKey] = useState<string | null>(null);

  const handleBrowse = (soundKey: string) => {
    log.debug('handleBrowse', 'open modal', { soundKey });
    setBrowseSoundKey(soundKey);
    setBrowseModalOpen(true);
  };

  const handleLibrarySelect = (selected: LibrarySound) => {
    if (!browseSoundKey) return;
    log.info('handleLibrarySelect', 'selected', { soundKey: browseSoundKey, selectedId: selected.id });
    updateStageSound(stageKey, browseSoundKey, { media_url: selected.media_url });
  };

  if (sounds.length === 0) {
    return (
      <>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No sounds yet
        </div>
        <SoundLibraryModal
          isOpen={browseModalOpen}
          onClose={() => setBrowseModalOpen(false)}
          onSelect={handleLibrarySelect}
        />
      </>
    );
  }

  return (
    <>
      <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-100px)]">
        {sounds.map((sound) => (
          <StageSoundItem
            key={sound.key}
            stageKey={stageKey}
            sound={sound}
            onBrowse={() => handleBrowse(sound.key)}
          />
        ))}
      </div>
      <SoundLibraryModal
        isOpen={browseModalOpen}
        onClose={() => setBrowseModalOpen(false)}
        onSelect={handleLibrarySelect}
      />
    </>
  );
}
