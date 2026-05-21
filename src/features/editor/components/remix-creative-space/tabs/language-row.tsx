// language-row.tsx — One language toggle row. Label = book language name;
// upsert keyed by language code.

import { Switch } from '@/components/ui/switch';
import type { RemixLanguageChoice } from '@/types/remix';

interface Props {
  name: string;
  code: string;
  entry: RemixLanguageChoice | undefined;
  onUpsert: (patch: Partial<RemixLanguageChoice>) => void;
}

export function LanguageRow({ name, code, entry, onUpsert }: Props) {
  const enabled = entry?.is_enabled ?? false;
  return (
    <div className="flex items-center justify-between px-1 py-2.5">
      <span className="text-sm font-medium">{name}</span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => onUpsert({ name, code, is_enabled: v })}
        aria-label={`Toggle ${name}`}
      />
    </div>
  );
}
