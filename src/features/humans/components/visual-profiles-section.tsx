// visual-profiles-section.tsx — Grid of inline-edit visual profile cards + add card.

import { memo, useState } from 'react';
import { Image as ImageIcon, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AddProfileCard } from '@/features/humans/components/shared/add-profile-card';
import { VISUAL_PROFILE_TYPES } from '@/constants/config-constants';
import type { VisualProfile } from '@/types/human';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'VisualProfilesSection');

interface VisualProfilesSectionProps {
  profiles: VisualProfile[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<Pick<VisualProfile, 'name' | 'age' | 'type'>>) => void;
  onRemove: (index: number) => void;
}

interface VisualProfileCardProps {
  profile: VisualProfile;
  onUpdate: (patch: Partial<Pick<VisualProfile, 'name' | 'age' | 'type'>>) => void;
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

function VisualProfileCardImpl({ profile, onUpdate, onRemove }: VisualProfileCardProps) {
  const [trackedName, setTrackedName] = useState(profile.name);
  const [trackedAge, setTrackedAge] = useState(profile.age);
  const [localName, setLocalName] = useState(profile.name);
  const [localAge, setLocalAge] = useState<string>(String(profile.age ?? 0));

  // Drift correction: server-side canonical value lands → reset local mirror.
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
      log.warn('commitName', 'invalid; reverting', { length: trimmed.length });
      setLocalName(profile.name);
      return;
    }
    onUpdate({ name: trimmed });
  };

  const commitAge = () => {
    const age = clampAge(localAge);
    if (age === null) {
      log.warn('commitAge', 'invalid; reverting');
      setLocalAge(String(profile.age ?? 0));
      return;
    }
    if (age === profile.age) return;
    onUpdate({ age });
  };

  const thumb = profile.rawImages[0];

  return (
    <article
      aria-label={`Visual profile ${profile.name || 'unnamed'}`}
      className="flex w-[280px] flex-col gap-2 self-start rounded-lg border border-border bg-card overflow-hidden"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove profile"
          className={cn(
            'absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full',
            'bg-background/80 backdrop-blur text-muted-foreground hover:bg-destructive hover:text-destructive-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {profile.rawImages.length > 1 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-background/80 backdrop-blur px-2 py-0.5 text-xs font-medium">
            {profile.rawImages.length}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5 p-2">
        <Input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={commitName}
          placeholder="Name"
          maxLength={255}
          aria-label="Profile name"
        />
        <div className="grid grid-cols-[64px_1fr] gap-1.5">
          <Input
            type="number"
            min={0}
            max={120}
            step={1}
            value={localAge}
            onChange={(e) => setLocalAge(e.target.value)}
            onBlur={commitAge}
            aria-label="Age"
          />
          <Select
            value={profile.type}
            onValueChange={(v) => onUpdate({ type: v })}
          >
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISUAL_PROFILE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </article>
  );
}

const VisualProfileCard = memo(VisualProfileCardImpl);

export function VisualProfilesSection({
  profiles,
  onAdd,
  onUpdate,
  onRemove,
}: VisualProfilesSectionProps) {
  return (
    <section
      aria-labelledby="visual-profiles-heading"
      className="space-y-3 px-6 py-4"
    >
      <h2
        id="visual-profiles-heading"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Visual Profiles ({profiles.length})
      </h2>
      <div className="flex flex-wrap gap-3">
        {profiles.map((profile, idx) => (
          <VisualProfileCard
            key={profile.clientId}
            profile={profile}
            onUpdate={(patch) => onUpdate(idx, patch)}
            onRemove={() => onRemove(idx)}
          />
        ))}
        <AddProfileCard
          label="Add Face"
          sublabel="Upload image"
          icon={Plus}
          onClick={onAdd}
        />
      </div>
    </section>
  );
}
