// sound-library-modal.tsx - Browse and select sounds from the shared library.
// Tags multi-select filter (popover), pre-select via initialSoundId, real fetch
// from useSoundsStore.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Music, Check, Tags as TagsIcon, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { useSounds, useSoundsLoading, useSoundsActions } from '@/stores/sounds-store';

const log = createLogger('Editor', 'SoundLibraryModal');

export interface LibrarySound {
  id: string;
  name: string;
  description: string;
  tags: string[];
  duration: number; // ms
  media_url: string;
}

interface SoundLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: LibrarySound) => void;
  initialSoundId?: string | null;
}

// === Helpers ===

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTags(commaSep: string | null | undefined): string[] {
  if (!commaSep) return [];
  return commaSep
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function buildSubtitle(tags: string[], durationMs: number): string {
  const dur = formatMs(durationMs);
  if (tags.length === 0) return dur;
  const visible = tags.slice(0, 2).join(' · ');
  const overflow = tags.length > 2 ? ' · …' : '';
  return `${visible}${overflow} · ${dur}`;
}

export function SoundLibraryModal({
  isOpen,
  onClose,
  onSelect,
  initialSoundId,
}: SoundLibraryModalProps) {
  const sounds = useSounds();
  const isLoading = useSoundsLoading();
  const { fetchSounds } = useSoundsActions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(
    initialSoundId ?? null
  );
  const [isTagsPopoverOpen, setIsTagsPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Auto-fetch on open if library is empty
  useEffect(() => {
    if (isOpen && sounds.length === 0 && !isLoading) {
      log.debug('useEffect[fetch]', 'auto-fetch sounds', {});
      void fetchSounds();
    }
  }, [isOpen, sounds.length, isLoading, fetchSounds]);

  // Map store rows -> LibrarySound shape used by this modal
  const librarySounds = useMemo<LibrarySound[]>(
    () =>
      sounds.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? '',
        tags: parseTags(s.tags),
        duration: s.duration ?? 0,
        media_url: s.mediaUrl,
      })),
    [sounds]
  );

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of librarySounds) for (const t of s.tags) set.add(t);
    return [...set].sort();
  }, [librarySounds]);

  const filteredSounds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return librarySounds.filter((s) => {
      const matchName = q.length === 0 || s.name.toLowerCase().includes(q);
      const matchTags =
        selectedTags.length === 0 ||
        selectedTags.every((t) => s.tags.includes(t));
      return matchName && matchTags;
    });
  }, [librarySounds, searchQuery, selectedTags]);

  const filteredTags = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((t) => t.toLowerCase().includes(q));
  }, [availableTags, tagSearchQuery]);

  // Pre-select on open + scroll into view. Sync selection from props on
  // open/library-load — eslint-disable since this is an open-time sync pattern.
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sync selection on modal open */
    if (!initialSoundId) {
      setSelectedSoundId(null);
      return;
    }
    const exists = librarySounds.some((s) => s.id === initialSoundId);
    if (!exists) {
      setSelectedSoundId(null);
      return;
    }
    setSelectedSoundId(initialSoundId);
    /* eslint-enable react-hooks/set-state-in-effect */
    log.debug('useEffect[preselect]', 'pre-selected', { initialSoundId });

    // Defer scroll until DOM updated with selection state
    requestAnimationFrame(() => {
      const el = itemRefs.current[initialSoundId];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [isOpen, initialSoundId, librarySounds]);

  useEffect(() => {
    if (isOpen) {
      log.info('open', 'modal opened', {
        initialSoundId: initialSoundId ?? null,
        soundCount: librarySounds.length,
      });
    }
  }, [isOpen, initialSoundId, librarySounds.length]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedSoundId(null);
    setIsTagsPopoverOpen(false);
    setTagSearchQuery('');
    onClose();
  }, [onClose]);

  const handleSelect = useCallback(() => {
    if (!selectedSoundId) return;
    const sound = librarySounds.find((s) => s.id === selectedSoundId);
    if (!sound) return;
    log.info('handleSelect', 'sound selected', {
      id: sound.id,
      name: sound.name,
    });
    onSelect(sound);
    handleClose();
  }, [selectedSoundId, librarySounds, onSelect, handleClose]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];
      log.debug('toggleTag', 'tag toggled', { tag, selected: next });
      return next;
    });
  }, []);

  const removeTag = useCallback((tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const clearAllTags = useCallback(() => setSelectedTags([]), []);

  // Two-step Escape: close popover first, then modal
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      if (isTagsPopoverOpen) {
        setIsTagsPopoverOpen(false);
        return;
      }
      handleClose();
    },
    [isTagsPopoverOpen, handleClose]
  );

  const tagsButtonActive =
    isTagsPopoverOpen || selectedTags.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px]" aria-label="Sound Library">
        <DialogHeader>
          <DialogTitle>Sound Library</DialogTitle>
          <DialogDescription>
            Browse and select a sound from the library.
          </DialogDescription>
        </DialogHeader>

        {/* Search bar with tags trigger */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                log.debug('filter', 'search query changed', {
                  length: e.target.value.length,
                });
              }}
              placeholder="Search sounds by name..."
              className="pl-9"
              aria-label="Search sounds"
            />
          </div>
          <Popover
            open={isTagsPopoverOpen}
            onOpenChange={setIsTagsPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant={tagsButtonActive ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 shrink-0"
                aria-label="Filter by tags"
                aria-expanded={isTagsPopoverOpen}
              >
                <TagsIcon className="h-4 w-4" />
                Tags
                {selectedTags.length > 0 && (
                  <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs">
                    {selectedTags.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-3"
              onEscapeKeyDown={(e) => {
                e.preventDefault();
                setIsTagsPopoverOpen(false);
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Filter by tags
                </span>
                <button
                  type="button"
                  onClick={() => setIsTagsPopoverOpen(false)}
                  className="text-xs text-primary hover:underline"
                >
                  Done
                </button>
              </div>
              <Input
                value={tagSearchQuery}
                onChange={(e) => setTagSearchQuery(e.target.value)}
                placeholder="Search tags..."
                className="mb-2 h-8"
                aria-label="Search tags"
              />
              <div
                className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto"
                role="group"
                aria-label="Tag chips"
              >
                {filteredTags.length === 0 ? (
                  <span className="text-xs text-muted-foreground py-2">
                    {availableTags.length === 0
                      ? 'No tags available.'
                      : 'No tags match.'}
                  </span>
                ) : (
                  filteredTags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-input'
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Selected tags row */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAllTags}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Sound list */}
        <div
          className="max-h-[400px] overflow-y-auto space-y-1"
          role="listbox"
          aria-label="Sound list"
        >
          {filteredSounds.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              {isLoading && librarySounds.length === 0
                ? 'Loading sounds…'
                : librarySounds.length === 0
                  ? 'No sounds in library yet.'
                  : (
                    <span className="flex items-center gap-2">
                      No sounds match your filter.
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTags([]);
                          setSearchQuery('');
                        }}
                        className="text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    </span>
                  )}
            </div>
          ) : (
            filteredSounds.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              return (
                <button
                  key={sound.id}
                  ref={(el) => {
                    itemRefs.current[sound.id] = el;
                  }}
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
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">
                      {sound.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {buildSubtitle(sound.tags, sound.duration)}
                    </span>
                  </div>
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
