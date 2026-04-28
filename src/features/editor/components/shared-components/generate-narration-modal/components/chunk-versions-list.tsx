// chunk-versions-list.tsx — LATEST result rows for a chunk.
// Reverse-chronological display, original index passed back. Scrolls when
// rows > 3 (max-h ≈ 152px). Click row → onSelectResult(originalIdx).

import { useEffect, useRef } from 'react';

import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  durationSecondsFromWordTimings,
  formatDurationMmSs,
} from '../helpers/duration-from-word-timings';
import type { TextboxAudioResult } from './chunk-types';

const log = createLogger('NarrationChunkCard', 'VersionsList');

export interface ChunkVersionsListProps {
  results: TextboxAudioResult[];
  /** Index callback uses ORIGINAL idx in `results[]`, not display order. */
  onSelectResult: (originalIdx: number) => void;
  chunkIndex: number;
}

export function ChunkVersionsList({
  results,
  onSelectResult,
  chunkIndex,
}: ChunkVersionsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when results length grows (new generated → newest at top).
  const prevLenRef = useRef(results.length);
  useEffect(() => {
    if (results.length > prevLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevLenRef.current = results.length;
  }, [results.length]);

  // Build display order [originalIdx, result] — reverse-chrono.
  const displayRows: Array<{ result: TextboxAudioResult; originalIdx: number }> =
    results.map((result, originalIdx) => ({ result, originalIdx })).reverse();

  return (
    <div className="flex flex-col gap-2">
      <p
        id={`chunk-${chunkIndex}-latest-header`}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        LATEST ({results.length})
      </p>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Narration version history"
        className="max-h-[152px] overflow-y-auto pr-1"
      >
        <div
          role="radiogroup"
          aria-label="Narration versions"
          className="flex flex-col gap-1.5"
        >
          {displayRows.map(({ result, originalIdx }) => {
            const duration = formatDurationMmSs(
              durationSecondsFromWordTimings(result),
            );
            const isSelected = result.is_selected;
            const labelN = originalIdx + 1;
            return (
              <button
                key={`${originalIdx}-${result.url}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Result ${labelN}, ${duration}`}
                title={`Generated ${result.created_time}`}
                onClick={() => {
                  log.debug('selectResult', 'click', {
                    chunkIndex,
                    originalIdx,
                  });
                  onSelectResult(originalIdx);
                }}
                className={cn(
                  'flex h-12 items-center justify-between rounded-md border px-3 text-sm transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/30',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                      isSelected
                        ? 'border-primary'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {isSelected ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="font-medium">Result {labelN}</span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {duration}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
