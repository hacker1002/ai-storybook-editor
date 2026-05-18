// crop-sheet-build-badge.tsx — Dumb presentational badge for the Phase 1.5
// crop-sheet build task. 3 states: idle → null, running → spinner, error →
// warning tint + retry. Unlike AudioJobBadge the endpoint is synchronous (no
// background_jobs row) so there is no progress %, no cancel, no dismiss.
// Spec: ai-storybook-design/component/editor-page/remix-creative-space/01-remix-sidebar.md §3.6

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { CropSheetBuildStatus } from '@/types/remix';

const log = createLogger('Editor', 'CropSheetBuildBadge');

const RETRY_DEBOUNCE_MS = 1000;

interface CropSheetBuildBadgeProps {
  state: CropSheetBuildStatus;
  remixName: string;
  onRetry: () => Promise<void>;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '…';
}

export function CropSheetBuildBadge({
  state,
  remixName,
  onRetry,
}: CropSheetBuildBadgeProps) {
  const [retryBusy, setRetryBusy] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending retry-debounce timer on unmount to avoid setState on unmounted.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  if (state.state === 'idle') {
    return null;
  }

  const handleRetry = async () => {
    if (retryBusy) return;
    setRetryBusy(true);
    log.info('handleRetry', 'click', { remixName });
    try {
      await onRetry();
    } catch (err) {
      log.error('handleRetry', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // 1s UI dedupe — only blocks rapid spam clicks; store guards real state.
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryBusy(false);
      }, RETRY_DEBOUNCE_MS);
    }
  };

  const isRunning = state.state === 'running';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex items-center gap-2 h-9 px-2 rounded-md text-xs',
        isRunning
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
      )}
    >
      {isRunning ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="flex-1 truncate">
        {isRunning ? 'Building crop sheets…' : truncate(state.message, 40)}
      </span>

      {!isRunning && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleRetry}
          disabled={retryBusy}
          aria-label={`Retry crop sheet build for ${remixName}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
