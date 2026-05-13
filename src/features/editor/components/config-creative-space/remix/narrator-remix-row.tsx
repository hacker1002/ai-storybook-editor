// narrator-remix-row.tsx — singular toggle with fixed label.

import { Switch } from '@/components/ui/switch';

interface NarratorRemixRowProps {
  checked: boolean;
  onToggle: (next: boolean) => void;
}

const LABEL = 'Allow narrator remix';

export function NarratorRemixRow({ checked, onToggle }: NarratorRemixRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={LABEL} />
      <span className="flex-1 truncate text-sm">{LABEL}</span>
    </div>
  );
}
