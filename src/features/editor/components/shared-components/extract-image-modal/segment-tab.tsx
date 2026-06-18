// segment-tab.tsx — Segments tab (design 01-segment-tab.md): SAM3 prompt-based single-
// object extract. The hook owns model + prompt; it returns a Handle (ParamsPanel + run +
// gate) the root consumes. runExtract → callSegmentLayer → ONE ExtractResult (root appends).

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createLogger } from '@/utils/logger';
import { callSegmentLayer, type SegmentLayerResult } from '@/apis/retouch-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import {
  SEGMENT_MODEL_OPTIONS,
  DEFAULT_SEGMENT_MODEL,
  Z_INDEX,
  type ExtractResult,
} from './extract-image-modal-constants';
import { mapExtractError } from './extract-image-modal-utils';

const log = createLogger('Editor', 'SegmentTab');

// Radix popper copies the content's computed z onto its portal wrapper — without this the
// dropdown (shadcn default z-50) paints behind the full-screen modal (z-4000). See memory.
const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS =
  'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
const SECTION_LABEL_CLASS =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';

export interface SegmentTabHandle {
  model: string;
  prompt: string;
  /** prompt non-empty (root AND-gates with !isProcessing && source present). */
  canRun: boolean;
  ParamsPanel: ReactNode;
  /** Resolves to [1 result] on success; throws Error(mapExtractError) on API failure. */
  runExtract: (sourceUrl: string) => Promise<ExtractResult[]>;
  /** Reset prompt + session ordinal (root.resetState on close/forcePop). */
  reset: () => void;
}

interface UseSegmentTabOptions {
  /** processing || committing — disables the controls. */
  isBusy: boolean;
  /** Ctrl/Cmd+Enter in the prompt → root.handleRunExtract. */
  onRequestRun: () => void;
}

export function useSegmentTabState(
  image: SpreadImage,
  { isBusy, onRequestRun }: UseSegmentTabOptions,
): SegmentTabHandle {
  const [model, setModel] = useState<string>(DEFAULT_SEGMENT_MODEL);
  const [prompt, setPrompt] = useState('');
  // Session ordinal for a friendly title ("Segment N") — append mode keeps it monotonic.
  // Mutated only in the run handler (never in render).
  const ordinalRef = useRef(0);

  const canRun = prompt.trim() !== '';

  const runExtract = useCallback(
    async (sourceUrl: string): Promise<ExtractResult[]> => {
      const trimmed = prompt.trim();
      if (trimmed === '') return [];
      log.info('runExtract', 'segment start', { promptLen: trimmed.length });

      const res = await callSegmentLayer({ imageUrl: sourceUrl, prompt: trimmed });
      if (!res.success) {
        const failure = res as ImageApiFailure;
        log.warn('runExtract', 'segment failed', {
          errorCode: failure.errorCode,
          httpStatus: failure.httpStatus,
        });
        throw new Error(mapExtractError(failure));
      }

      const ok = res as SegmentLayerResult;
      const ordinal = (ordinalRef.current += 1);
      log.info('runExtract', 'segment success', {
        ordinal,
        coverageRatio: ok.meta?.coverageRatio,
      });
      return [
        {
          id: crypto.randomUUID(),
          media_url: ok.data!.imageUrl,
          sourceTab: 'segment',
          title: `${image.title ?? 'Image'} - Segment ${ordinal}`,
          meta: { prompt: trimmed, coverageRatio: ok.meta?.coverageRatio },
        },
      ];
    },
    [prompt, image.title],
  );

  const reset = useCallback(() => {
    setModel(DEFAULT_SEGMENT_MODEL);
    setPrompt('');
    ordinalRef.current = 0;
  }, []);

  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onRequestRun();
      }
    },
    [onRequestRun],
  );

  // Right-sidebar params panel — inlined (not a separate exported component) so this
  // module exports only the hook (react-refresh/only-export-components).
  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <div className="flex flex-col gap-5 px-4 py-4">
        <section>
          <p className={SECTION_LABEL_CLASS}>Model</p>
          <Select value={model} onValueChange={setModel} disabled={isBusy}>
            <SelectTrigger className={DARK_TRIGGER_CLASS} aria-label="Segment model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={SELECT_CONTENT_STYLE}>
              {SEGMENT_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section>
          <p className={SECTION_LABEL_CLASS}>Prompt</p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Describe what to segment..."
            rows={3}
            disabled={isBusy}
            aria-label="Segmentation prompt"
            className="resize-none border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-primary)] placeholder:text-[var(--swap-modal-text-muted)] focus-visible:ring-[var(--swap-modal-accent)]"
          />
          <p className="mt-1 text-[11px] text-[var(--swap-modal-text-muted)]">
            English only · Press Ctrl/Cmd + Enter to extract
          </p>
        </section>
      </div>
    ),
    [model, prompt, isBusy, handlePromptKeyDown],
  );

  return { model, prompt, canRun, ParamsPanel, runExtract, reset };
}
