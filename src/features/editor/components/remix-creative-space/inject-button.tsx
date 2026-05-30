// inject-button.tsx — Phase 3 Inject action button (4 render states).
// Inject is a synchronous client-side finalize (resolve is_final crops → mutate
// illustration → 1 Supabase UPDATE). State is owned by the parent
// (RemixAccordionItem); this is a controlled view.

import { Loader2, Repeat, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InjectUiState } from '@/types/remix';

interface InjectButtonProps {
  injectState: InjectUiState;
  /** Fired on click in idle/done/error states. Parent runs injectFinalCrops. */
  onInject: () => void;
  /** Gate: true iff ≥1 batch has an injectable `is_final` winner crop. When
   *  false, the actionable variants (idle Inject / done Re-inject / error
   *  Retry) render disabled — mirrors `injectFinalCrops`'s precondition. */
  canInject: boolean;
}

const NOTHING_TO_INJECT_HINT = 'No swapped batches to inject yet';

/** Short HH:MM local time for the "Injected · {time}" label. */
function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function InjectButton({
  injectState,
  onInject,
  canInject,
}: InjectButtonProps) {
  if (injectState.state === 'loading') {
    return (
      <Button
        disabled
        size="sm"
        variant="secondary"
        className="w-full"
        title="Injecting…"
      >
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        Injecting…
      </Button>
    );
  }

  if (injectState.state === 'done') {
    return (
      <div className="flex items-center gap-2">
        <span className="flex flex-1 items-center text-xs text-muted-foreground">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />
          Injected {injectState.appliedCount} · {shortTime(injectState.injectedAt)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canInject}
          onClick={onInject}
          title={canInject ? 'Re-inject final crops' : NOTHING_TO_INJECT_HINT}
        >
          <Repeat className="mr-2 h-3.5 w-3.5" />
          Re-inject
        </Button>
      </div>
    );
  }

  if (injectState.state === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex flex-1 items-center text-xs text-destructive"
          title={injectState.message}
        >
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          Failed
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canInject}
          onClick={onInject}
          title={canInject ? 'Retry inject' : NOTHING_TO_INJECT_HINT}
        >
          <Repeat className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  // idle
  return (
    <Button
      size="sm"
      variant="secondary"
      className="w-full"
      disabled={!canInject}
      onClick={onInject}
      title={
        canInject
          ? 'Inject final crops into the illustration'
          : NOTHING_TO_INJECT_HINT
      }
    >
      <Repeat className="mr-2 h-3.5 w-3.5" />
      Inject
    </Button>
  );
}
