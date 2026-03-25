// sound-library-modal.tsx - Modal to browse and select sounds from the library (all props/stages)

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Music, Check } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SoundLibraryModal');

export interface LibrarySound {
  id: string;
  name: string;
  type: 'prop' | 'stage';
  duration: string;
  media_url: string;
}

// Mock data — will be replaced with real store/API data later
const MOCK_SOUNDS: LibrarySound[] = [
  { id: '1', name: 'Dragon Roar', type: 'prop', duration: '0:03', media_url: '' },
  { id: '2', name: 'Sword Swing', type: 'prop', duration: '0:01', media_url: '' },
  { id: '3', name: 'Magic Spell', type: 'prop', duration: '0:04', media_url: '' },
  { id: '4', name: 'Forest Ambience', type: 'stage', duration: '1:30', media_url: '' },
  { id: '5', name: 'Rain on Roof', type: 'stage', duration: '2:00', media_url: '' },
  { id: '6', name: 'Wind Chime', type: 'prop', duration: '0:02', media_url: '' },
  { id: '7', name: 'Ocean Waves', type: 'stage', duration: '3:00', media_url: '' },
  { id: '8', name: 'Footsteps on Gravel', type: 'prop', duration: '0:05', media_url: '' },
];

interface SoundLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: LibrarySound) => void;
}

type FilterType = 'all' | 'prop' | 'stage';

const FILTER_TABS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'prop', label: 'Prop' },
  { value: 'stage', label: 'Stage' },
];

export function SoundLibraryModal({ isOpen, onClose, onSelect }: SoundLibraryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);

  // TODO: Replace MOCK_SOUNDS with real data from store/API
  const allSounds = MOCK_SOUNDS;

  const filteredSounds = useMemo(() => {
    return allSounds
      .filter((s) => activeFilter === 'all' || s.type === activeFilter)
      .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allSounds, activeFilter, searchQuery]);

  const handleSelect = () => {
    if (!selectedSoundId) return;
    const sound = allSounds.find((s) => s.id === selectedSoundId);
    if (!sound) return;
    log.info('handleSelect', 'selected', { id: sound.id, name: sound.name });
    onSelect(sound);
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setActiveFilter('all');
    setSelectedSoundId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-[480px]" aria-label="Sound Library">
        <DialogHeader>
          <DialogTitle>Sound Library</DialogTitle>
          <DialogDescription>Browse and select a sound from the library.</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sounds by name..."
            className="pl-9"
            aria-label="Search sounds"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b" role="tablist" aria-orientation="horizontal">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeFilter === tab.value}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                activeFilter === tab.value
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => {
                setActiveFilter(tab.value);
                log.debug('filterChange', 'switched', { filter: tab.value });
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sound list */}
        <div
          className="max-h-[400px] overflow-y-auto space-y-1"
          role="listbox"
          aria-label="Sound list"
        >
          {filteredSounds.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              {allSounds.length === 0
                ? 'No sounds with audio in the library.'
                : 'No sounds match your search.'}
            </div>
          ) : (
            filteredSounds.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              return (
                <button
                  key={sound.id}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                    isSelected
                      ? 'bg-blue-50 border border-primary'
                      : 'hover:bg-muted border border-transparent'
                  )}
                  onClick={() => setSelectedSoundId(sound.id)}
                >
                  {/* Music icon */}
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Name + type */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{sound.name}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="capitalize">{sound.type}</span> · {sound.duration}
                    </span>
                  </div>

                  {/* Checkmark */}
                  {isSelected && (
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedSoundId}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
