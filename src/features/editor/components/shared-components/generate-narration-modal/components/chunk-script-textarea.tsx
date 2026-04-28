// chunk-script-textarea.tsx — Script editor + counter + inline error.
// Soft `maxLength` larger than hard cap so user can see "exceeded" state
// instead of being silently truncated. Hard cap enforced by validation.

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { SCRIPT_MAX_CHARS } from '@/types/textbox-audio-adapter';

const log = createLogger('NarrationChunkCard', 'ScriptTextarea');

const SOFT_CAP = SCRIPT_MAX_CHARS + 100; // small overflow allowed for visual feedback

export interface ChunkScriptTextareaProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  chunkIndex: number;
  /** True when validation reports `script_too_long`. */
  isTooLong: boolean;
  /** True when validation reports `script_empty` AND user has not typed yet. */
  isEmpty: boolean;
}

export function ChunkScriptTextarea({
  value,
  onChange,
  disabled,
  chunkIndex,
  isTooLong,
  isEmpty,
}: ChunkScriptTextareaProps) {
  const counterId = `chunk-${chunkIndex}-script-counter`;
  const errorId = `chunk-${chunkIndex}-script-error`;
  const len = value.length;
  const hasError = isTooLong;
  const describedBy = [counterId, hasError ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          log.debug('scriptChange', 'user typed', {
            chunkIndex,
            length: next.length,
          });
          onChange(next);
        }}
        disabled={disabled}
        maxLength={SOFT_CAP}
        placeholder="Enter narration text…"
        aria-label={`Chunk ${chunkIndex + 1} script`}
        aria-invalid={hasError}
        aria-describedby={describedBy || undefined}
        className={cn(
          'min-h-24 resize-y',
          hasError && 'border-destructive focus-visible:ring-destructive',
          isEmpty && 'border-muted-foreground/40',
        )}
      />
      <div className="flex items-center justify-between">
        <span
          id={counterId}
          className={cn(
            'text-xs tabular-nums',
            hasError ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {len}/{SCRIPT_MAX_CHARS}
        </span>
        {hasError ? (
          <span id={errorId} className="text-xs text-destructive">
            Script exceeds {SCRIPT_MAX_CHARS} chars
          </span>
        ) : null}
      </div>
    </div>
  );
}
