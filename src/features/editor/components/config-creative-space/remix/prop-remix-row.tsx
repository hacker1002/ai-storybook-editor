// prop-remix-row.tsx — toggle + name. Simplest row.

import { Switch } from '@/components/ui/switch';

interface PropRemixRowProps {
  name: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}

export function PropRemixRow({ name, checked, onToggle }: PropRemixRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`Toggle remix for ${name}`} />
      <span className="flex-1 truncate text-sm">{name}</span>
    </div>
  );
}
