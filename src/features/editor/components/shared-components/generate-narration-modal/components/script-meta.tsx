// script-meta.tsx — Footer strip under the ScriptEditor showing length/turn
// counter, stale chip when the cached audio no longer matches the script,
// and a collapsible list of resolve errors mapped to Vietnamese messages.

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/utils/utils';
import type { ResolveError } from '../helpers/script-resolver';
import { errorMessageFor } from '../helpers/narration-error-messages';

export interface ScriptMetaProps {
  resolvedLength: number;
  maxLength: number;
  turnCount: number;
  resolveErrors: ResolveError[];
  isDirty: boolean;
}

export function ScriptMeta({
  resolvedLength,
  maxLength,
  turnCount,
  resolveErrors,
  isDirty,
}: ScriptMetaProps) {
  const [errorsOpen, setErrorsOpen] = useState(false);
  const overLimit = resolvedLength > maxLength;
  const hasErrors = resolveErrors.length > 0;

  return (
    <div className="flex w-full flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'tabular-nums',
            overLimit ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {resolvedLength}/{maxLength} chars · {turnCount} turn
          {turnCount === 1 ? '' : 's'}
        </span>
        {isDirty && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Script changed — regenerate to sync
          </span>
        )}
      </div>

      {hasErrors && (
        <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded border border-destructive/40 bg-destructive/10',
              'px-2 py-1 text-left font-medium text-destructive',
            )}
          >
            {errorsOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {resolveErrors.length} unresolved speaker
            {resolveErrors.length === 1 ? '' : 's'}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-1 pl-5 text-destructive">
              {resolveErrors.map((err, idx) => (
                <li
                  key={`${err.speakerKey}-${err.reason}-${idx}`}
                  className="list-disc"
                >
                  {errorMessageFor(err)}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
