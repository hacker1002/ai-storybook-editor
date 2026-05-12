// voice-profiles-section.tsx — Grid of voice profile cards with section-level singleton audio playback.

import { memo, useEffect, useRef, useState } from 'react';
import { Play, Plus, Square, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AddProfileCard } from '@/features/humans/components/shared/add-profile-card';
import type { VoiceProfile } from '@/types/human';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'VoiceProfilesSection');

interface VoiceProfilesSectionProps {
  profiles: VoiceProfile[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<Pick<VoiceProfile, 'name' | 'age'>>) => void;
  onRemove: (index: number) => void;
}

interface VoiceProfileCardProps {
  profile: VoiceProfile;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onUpdate: (patch: Partial<Pick<VoiceProfile, 'name' | 'age'>>) => void;
  onRemove: () => void;
}

function clampAge(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 0 || i > 120) return null;
  return i;
}

function VoiceProfileCardImpl({
  profile,
  isPlaying,
  onPlay,
  onStop,
  onUpdate,
  onRemove,
}: VoiceProfileCardProps) {
  const [trackedName, setTrackedName] = useState(profile.name);
  const [trackedAge, setTrackedAge] = useState(profile.age);
  const [localName, setLocalName] = useState(profile.name);
  const [localAge, setLocalAge] = useState<string>(String(profile.age ?? 0));

  if (profile.name !== trackedName) {
    setTrackedName(profile.name);
    setLocalName(profile.name);
  }
  if (profile.age !== trackedAge) {
    setTrackedAge(profile.age);
    setLocalAge(String(profile.age ?? 0));
  }

  const commitName = () => {
    const trimmed = localName.trim();
    if (trimmed === profile.name) return;
    if (trimmed.length < 1 || trimmed.length > 255) {
      setLocalName(profile.name);
      return;
    }
    onUpdate({ name: trimmed });
  };

  const commitAge = () => {
    const age = clampAge(localAge);
    if (age === null) {
      setLocalAge(String(profile.age ?? 0));
      return;
    }
    if (age === profile.age) return;
    onUpdate({ age });
  };

  return (
    <article
      aria-label={`Voice profile ${profile.name || 'unnamed'}`}
      className="flex aspect-square w-[280px] flex-col self-start rounded-lg border border-border bg-card overflow-hidden"
    >
      <div className="relative flex flex-1 items-center justify-center bg-muted">
        <button
          type="button"
          onClick={isPlaying ? onStop : onPlay}
          className={cn(
            'inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground',
            'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={isPlaying ? 'Stop playback' : 'Play voice'}
        >
          {isPlaying ? <Square className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove voice profile"
          className={cn(
            'absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full',
            'bg-background/80 backdrop-blur text-muted-foreground hover:bg-destructive hover:text-destructive-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-1.5 p-2">
        <Input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={commitName}
          placeholder="Name"
          maxLength={255}
          aria-label="Voice name"
          className="flex-1"
        />
        <Input
          type="number"
          min={0}
          max={120}
          step={1}
          value={localAge}
          onChange={(e) => setLocalAge(e.target.value)}
          onBlur={commitAge}
          aria-label="Age"
          className="w-16"
        />
      </div>
    </article>
  );
}

const VoiceProfileCard = memo(VoiceProfileCardImpl);

export function VoiceProfilesSection({
  profiles,
  onAdd,
  onUpdate,
  onRemove,
}: VoiceProfilesSectionProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (audioRef.current === null) {
      const a = new Audio();
      a.preload = 'metadata';
      audioRef.current = a;
    }
    const audio = audioRef.current;
    const handleEnded = () => setPlayingIndex(null);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, []);

  // Guard playingIndex during render in case profiles array shrank.
  const effectivePlayingIndex =
    playingIndex !== null && profiles[playingIndex]?.recordUrl ? playingIndex : null;
  if (playingIndex !== null && effectivePlayingIndex === null) {
    setPlayingIndex(null);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (effectivePlayingIndex === null) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const profile = profiles[effectivePlayingIndex];
    audio.src = profile.recordUrl;
    audio.play().catch((err) => {
      log.warn('play', 'failed', { error: String(err) });
    });
  }, [effectivePlayingIndex, profiles]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return (
    <section
      aria-labelledby="voice-profiles-heading"
      className="space-y-3 px-6 py-4"
    >
      <h2
        id="voice-profiles-heading"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Voice Profiles ({profiles.length})
      </h2>
      <div className="flex flex-wrap gap-3">
        {profiles.map((profile, idx) => (
          <VoiceProfileCard
            key={profile.clientId}
            profile={profile}
            isPlaying={effectivePlayingIndex === idx}
            onPlay={() => setPlayingIndex(idx)}
            onStop={() => setPlayingIndex(null)}
            onUpdate={(patch) => onUpdate(idx, patch)}
            onRemove={() => {
              if (playingIndex === idx) setPlayingIndex(null);
              onRemove(idx);
            }}
          />
        ))}
        <AddProfileCard
          label="Add Voice"
          sublabel="Upload audio"
          icon={Plus}
          onClick={onAdd}
        />
      </div>
    </section>
  );
}
