// language-remix-row.tsx — toggle + pre-formatted label.

import { Switch } from '@/components/ui/switch';

interface LanguageRemixRowProps {
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}

export function LanguageRemixRow({ label, checked, onToggle }: LanguageRemixRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle remix for ${label}`} />
      <span className="flex-1 truncate text-sm">{label}</span>
    </div>
  );
}
