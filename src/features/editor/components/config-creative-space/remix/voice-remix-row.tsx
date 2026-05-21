// voice-remix-row.tsx — toggle + name for one voice subject (character | narrator).
// Replaces the old singular narrator-remix-row; the narrator is now one voice
// slot among per-character voice slots (book.remix.voices[]).

import { Switch } from '@/components/ui/switch';

interface VoiceRemixRowProps {
  name: string; // character.name | 'Narrator'
  checked: boolean;
  onToggle: (next: boolean) => void;
}

export function VoiceRemixRow({ name, checked, onToggle }: VoiceRemixRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle voice remix for ${name}`} />
      <span className="flex-1 truncate text-sm">{name}</span>
    </div>
  );
}
