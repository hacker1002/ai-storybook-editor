// CollaboratorFilterPopover — funnel button + multi-select popover that filters the
// sidebar list CLIENT-side. Three groups (LANGUAGES / STEPS / STATUS): OR within a
// group, AND across groups (see collaborator-sidebar.tsx applyFilter). Toggling a
// checkbox applies immediately (no Apply button). A count badge on the funnel shows
// how many options are active.
//
// LANGUAGES options = the book's ENABLED languages (passed in, never hardcoded).
// This popover lives in a normal side panel (not inside a high-z modal), so the
// default Radix z-50 / click-outside behaviour is correct — no z-index or
// InteractionLayerStack registration is needed here.

import { Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { createLogger } from '@/utils/logger';
import type { Language } from '@/types/editor';
import { STATUS_META, type CollabStatus, type PipelineStep } from './collaboration-space-types';
import type { CollaboratorFilter } from './collaborator-filter';

const log = createLogger('Editor', 'CollaboratorFilterPopover');

const STEP_OPTIONS: { value: PipelineStep; label: string }[] = [
  { value: 'sketch', label: 'Sketch' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'retouch', label: 'Retouch' },
];

// Status order per design §2.5: Active, Invited, Pending, Suspended.
const STATUS_OPTIONS: CollabStatus[] = [2, 1, 0, 3];

/** Total number of active filter selections (for the funnel badge). */
function countActive(filter: CollaboratorFilter): number {
  return filter.languages.length + filter.steps.length + filter.statuses.length;
}

/** Toggle membership of `value` in `list` (add if absent, remove if present). */
function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface CollaboratorFilterPopoverProps {
  filter: CollaboratorFilter;
  bookLanguages: Language[];
  onFilterChange: (next: CollaboratorFilter) => void;
}

export function CollaboratorFilterPopover({
  filter,
  bookLanguages,
  onFilterChange,
}: CollaboratorFilterPopoverProps) {
  const activeCount = countActive(filter);

  const toggleLanguage = (code: string) => {
    log.debug('toggleLanguage', 'language toggled', { code, on: !filter.languages.includes(code) });
    onFilterChange({ ...filter, languages: toggleIn(filter.languages, code) });
  };

  const toggleStep = (step: PipelineStep) => {
    log.debug('toggleStep', 'step toggled', { step, on: !filter.steps.includes(step) });
    onFilterChange({ ...filter, steps: toggleIn(filter.steps, step) });
  };

  const toggleStatus = (status: CollabStatus) => {
    log.debug('toggleStatus', 'status toggled', { status, on: !filter.statuses.includes(status) });
    onFilterChange({ ...filter, statuses: toggleIn(filter.statuses, status) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter collaborators"
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <Filter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-3 p-3">
        {/* LANGUAGES */}
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Languages</h4>
          {bookLanguages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No languages enabled</p>
          ) : (
            bookLanguages.map((lang) => (
              <label key={lang.code} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={filter.languages.includes(lang.code)}
                  onCheckedChange={() => toggleLanguage(lang.code)}
                  aria-label={lang.name}
                />
                <span>{lang.name}</span>
              </label>
            ))
          )}
        </section>

        <Separator />

        {/* STEPS */}
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</h4>
          {STEP_OPTIONS.map((step) => (
            <label key={step.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={filter.steps.includes(step.value)}
                onCheckedChange={() => toggleStep(step.value)}
                aria-label={step.label}
              />
              <span>{step.label}</span>
            </label>
          ))}
        </section>

        <Separator />

        {/* STATUS */}
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</h4>
          {STATUS_OPTIONS.map((status) => (
            <label key={status} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={filter.statuses.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
                aria-label={STATUS_META[status].label}
              />
              <span>{STATUS_META[status].label}</span>
            </label>
          ))}
        </section>
      </PopoverContent>
    </Popover>
  );
}
