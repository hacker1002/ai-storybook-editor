// sounds-tab-panel.tsx - Lists all prop sounds as flat items (no accordion)

import { useState, useMemo } from 'react';
import { useSnapshotActions } from '@/stores/snapshot-store';
import type { PropSound } from '@/types/prop-types';
import { SoundItem } from './sound-item';
import { SoundLibraryModal, type LibrarySound } from '@/features/editor/components/shared-components';
import { useSounds } from '@/stores/sounds-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SoundsTabPanel');

// Prop sounds get user-typed names via the create-sound dialog. Treat any
// non-empty name as user-customized and preserve it on backfill; only fill
// when the slot was created without a name.
const DEFAULT_SOUND_NAMES = new Set<string>([]);

interface SoundsTabPanelProps {
  propKey: string;
  sounds: PropSound[];
}

export function SoundsTabPanel({ propKey, sounds }: SoundsTabPanelProps) {
  log.debug('render', 'init', { propKey, count: sounds.length });

  const { updatePropSound } = useSnapshotActions();
  const allSounds = useSounds();
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browseSoundKey, setBrowseSoundKey] = useState<string | null>(null);

  const initialSoundId = useMemo(() => {
    if (!browseSoundKey) return null;
    const current = sounds.find((s) => s.key === browseSoundKey);
    if (!current?.media_url) return null;
    const id = allSounds.find((s) => s.mediaUrl === current.media_url)?.id ?? null;
    log.debug('handleBrowse', 'resolved initialSoundId', { soundKey: browseSoundKey, initialSoundId: id });
    return id;
  }, [browseSoundKey, sounds, allSounds]);

  const handleBrowse = (soundKey: string) => {
    log.debug('handleBrowse', 'open modal', { soundKey });
    setBrowseSoundKey(soundKey);
    setBrowseModalOpen(true);
  };

  const handleLibrarySelect = (selected: LibrarySound) => {
    if (!browseSoundKey) return;
    const current = sounds.find((s) => s.key === browseSoundKey);
    const shouldOverwriteName =
      !current?.name?.trim() ||
      DEFAULT_SOUND_NAMES.has(current.name);
    const patch: Partial<PropSound> = {
      media_url: selected.media_url,
      description: selected.description,
      ...(shouldOverwriteName ? { name: selected.name } : {}),
    };
    log.info('handleLibrarySelect', 'patched', {
      soundKey: browseSoundKey,
      mediaUrl: selected.media_url,
      overwriteName: shouldOverwriteName,
    });
    updatePropSound(propKey, browseSoundKey, patch);
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
          initialSoundId={initialSoundId}
        />
      </>
    );
  }

  return (
    <>
      <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-100px)]">
        {sounds.map((sound) => (
          <SoundItem
            key={sound.key}
            propKey={propKey}
            sound={sound}
            onBrowse={() => handleBrowse(sound.key)}
          />
        ))}
      </div>
      <SoundLibraryModal
        isOpen={browseModalOpen}
        onClose={() => setBrowseModalOpen(false)}
        onSelect={handleLibrarySelect}
        initialSoundId={initialSoundId}
      />
    </>
  );
}
