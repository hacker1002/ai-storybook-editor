// display-name-table.tsx — 5-row inline table for entering displayName per locale.

import { Input } from '@/components/ui/input';

export interface DisplayNameLanguage {
  code: string;
  label: string;
  name: string;
}

interface DisplayNameTableProps {
  values: Record<string, string>;
  languages: ReadonlyArray<DisplayNameLanguage>;
  onChange: (langCode: string, value: string) => void;
  onBlur?: (langCode: string) => void;
  disabled?: boolean;
}

function englishName(label: string): string {
  const idx = label.indexOf(' (');
  return idx === -1 ? label : label.slice(0, idx);
}

export function DisplayNameTable({
  values,
  languages,
  onChange,
  onBlur,
  disabled,
}: DisplayNameTableProps) {
  return (
    <div className="space-y-2">
      {languages.map((lang) => {
        const name = englishName(lang.label);
        return (
          <div
            key={lang.code}
            className="grid grid-cols-[160px_1fr] items-stretch gap-3"
          >
            <label
              htmlFor={`displayName-${lang.code}`}
              className="flex items-center rounded-md bg-muted/50 px-3 text-sm text-muted-foreground"
            >
              {name}
            </label>
            <Input
              id={`displayName-${lang.code}`}
              value={values[lang.code] ?? ''}
              onChange={(e) => onChange(lang.code, e.target.value)}
              onBlur={() => onBlur?.(lang.code)}
              disabled={disabled}
              maxLength={255}
              placeholder={`Display name in ${name}`}
            />
          </div>
        );
      })}
    </div>
  );
}
