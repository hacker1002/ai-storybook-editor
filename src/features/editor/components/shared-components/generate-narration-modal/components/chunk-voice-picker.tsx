// chunk-voice-picker.tsx — Local sub-component used by NarrationChunkCard.
// Radix Select (modal=false) wired to {voice_id} → {voice_name (source_label)}.
// Source = narrator + characters voices (NOT full voices catalog) per spec §4.

import { AlertTriangle } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Voice, VoiceOption } from './chunk-types';

const log = createLogger('NarrationChunkCard', 'VoicePicker');

export interface ChunkVoicePickerProps {
  value: string | null;
  onChange: (voice_id: string) => void;
  options: VoiceOption[];
  voicesById: Map<string, Voice>;
  disabled?: boolean;
  /** For aria-label — `Voice for chunk {index+1}`. */
  chunkIndex: number;
}

export function ChunkVoicePicker({
  value,
  onChange,
  options,
  voicesById,
  disabled,
  chunkIndex,
}: ChunkVoicePickerProps) {
  // Empty catalog: render disabled trigger with hint.
  if (options.length === 0) {
    return (
      <button
        type="button"
        disabled
        aria-label={`Voice for chunk ${chunkIndex + 1}`}
        className="flex h-9 min-w-[200px] items-center justify-center gap-1.5 rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-3 text-xs text-destructive opacity-80"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        No voices available
      </button>
    );
  }

  const matchedOption = value
    ? options.find((o) => o.voice_id === value) ?? null
    : null;
  const fallbackName =
    !matchedOption && value ? voicesById.get(value)?.name ?? null : null;

  const handleChange = (next: string) => {
    log.debug('handleChange', 'voice change', {
      chunkIndex,
      from: value,
      to: next,
    });
    onChange(next);
  };

  // Trigger label states:
  //  - !value           → "⚠ Choose a voice" (red)
  //  - value && !matched → "⚠ Voice unavailable" (red) — use fallbackName tooltip if any
  //  - value && matched  → "{source_label}" (Narrator | character name)
  // voice_name kept in tooltip only — picker is character-centric per UX spec.
  const triggerInvalid = !value || !matchedOption;

  return (
    <Select
      value={value ?? undefined}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={`Voice for chunk ${chunkIndex + 1}`}
        aria-invalid={triggerInvalid}
        title={
          fallbackName
            ? `Last voice id ${value} (deleted)`
            : matchedOption?.voice_name
        }
        className={cn(
          'h-9 w-auto min-w-[200px]',
          triggerInvalid && 'border-destructive text-destructive',
        )}
      >
        <SelectValue
          placeholder={
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Choose a voice
            </span>
          }
        >
          {matchedOption ? (
            <span className="truncate">{matchedOption.source_label}</span>
          ) : value ? (
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Voice unavailable
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem
            key={opt.voice_id}
            value={opt.voice_id}
            title={opt.voice_name}
          >
            {opt.source_label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
