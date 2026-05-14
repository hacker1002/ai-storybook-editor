// chunk-voice-picker.tsx — Local sub-component used by NarrationChunkCard.
// Radix Select reader-centric (2026-05-14): keyed by `reader_key` (narrator
// vs character.key) so shared voices show one entry per reader. Source =
// narrator + characters with voice_setting (skip if no voice).

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
  /** Current reader_key on the chunk; undefined for legacy chunks pre-migration. */
  readerKey: string | null;
  /** Current voice_id on the chunk; used only as fallback match when readerKey is null. */
  voiceId: string | null;
  /** Caller receives both — chunk must set voice_id + reader_key atomically. */
  onChange: (readerKey: string, voiceId: string) => void;
  options: VoiceOption[];
  voicesById: Map<string, Voice>;
  disabled?: boolean;
  /** For aria-label — `Voice for chunk {index+1}`. */
  chunkIndex: number;
}

export function ChunkVoicePicker({
  readerKey,
  voiceId,
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

  // Match priority: exact reader_key → first option sharing voice_id (legacy
  // chunks without reader_key fall back here, narrator wins by buildVoiceOptions
  // ordering). Never auto-mutates chunk — user must pick explicitly to commit
  // reader_key.
  const matchedByReader = readerKey
    ? options.find((o) => o.reader_key === readerKey) ?? null
    : null;
  const matchedByVoice =
    !matchedByReader && voiceId
      ? options.find((o) => o.voice_id === voiceId) ?? null
      : null;
  const matchedOption = matchedByReader ?? matchedByVoice;

  const fallbackName =
    !matchedOption && voiceId ? voicesById.get(voiceId)?.name ?? null : null;

  const handleChange = (nextReaderKey: string) => {
    const picked = options.find((o) => o.reader_key === nextReaderKey);
    if (!picked) {
      log.warn('handleChange', 'unknown reader_key from picker', { nextReaderKey });
      return;
    }
    log.debug('handleChange', 'reader change', {
      chunkIndex,
      fromReader: readerKey,
      toReader: nextReaderKey,
      voiceId: picked.voice_id,
    });
    onChange(picked.reader_key, picked.voice_id);
  };

  // Trigger label states:
  //  - !voiceId           → "⚠ Choose a voice" (red, no value set)
  //  - voiceId && !matched → "⚠ Voice unavailable" (red) — fallbackName tooltip if any
  //  - matched             → "{source_label}" (Narrator | character name)
  const triggerInvalid = !voiceId || !matchedOption;

  return (
    <Select
      value={matchedOption?.reader_key ?? undefined}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={`Voice for chunk ${chunkIndex + 1}`}
        aria-invalid={triggerInvalid}
        title={
          fallbackName
            ? `Last voice id ${voiceId} (deleted)`
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
          ) : voiceId ? (
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
            key={opt.reader_key}
            value={opt.reader_key}
            title={opt.voice_name}
          >
            {opt.source_label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
