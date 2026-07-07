// PipelineStepMatrix — the access_rights.steps editor: one tri-state StepGroup per
// pipeline step (sketch / illustration / retouch), each with a parent checkbox +
// per-resource children (STEP_RESOURCES).
//
// Tri-state parent (design §02 2.5 — intentional divergence from the recording, which
// had no indeterminate): DB `enabled` is INDEPENDENT of the resources, so we must
// distinguish "step off" from "step on but no resource granted yet".
//   visual = !enabled ? unchecked : allOn ? checked : indeterminate
// Toggle rules:
//   parent click  → enabled ? uncheck-all : check-all  (indeterminate counts as "on" → uncheck)
//   resource ON   → resources[k]=true; force enabled=true
//   resource OFF  → resources[k]=false; KEEP enabled=true (parent → indeterminate/empty),
//                   never auto-disable — the only way to turn a step off is the parent.

import { Checkbox } from '@/components/ui/checkbox';
import { createLogger } from '@/utils/logger';
import { STEP_RESOURCES, type AccessRights, type PipelineStep } from './collaboration-space-types';

const log = createLogger('Editor', 'PipelineStepMatrix');

/** Render order (matches design §02 2.5). */
const STEP_ORDER: PipelineStep[] = ['sketch', 'illustration', 'retouch'];

const STEP_LABELS: Record<PipelineStep, string> = {
  sketch: 'Sketch',
  illustration: 'Illustration',
  retouch: 'Retouch',
};

/** resource key → display label; unknown keys fall back to the raw key. */
const RESOURCE_LABELS: Record<string, string> = {
  characters: 'Characters',
  props: 'Props',
  stages: 'Stages',
  spreads: 'Spreads',
  image: 'Image',
  textbox: 'Textbox',
  branches: 'Branches',
  objects: 'Objects',
  quiz: 'Quiz',
  remixes: 'Remixes',
};

function resourceLabel(key: string): string {
  return RESOURCE_LABELS[key] ?? key;
}

type StepValue = AccessRights['steps'][PipelineStep];

/** All resources of a step set to `on` (used by parent check-all / uncheck-all). */
function allResources(step: PipelineStep, on: boolean): Record<string, boolean> {
  return Object.fromEntries(STEP_RESOURCES[step].map((k) => [k, on] as const)) as Record<string, boolean>;
}

interface PipelineStepMatrixProps {
  steps: AccessRights['steps'];
  onStepChange: (step: PipelineStep, next: StepValue) => void;
}

export function PipelineStepMatrix({ steps, onStepChange }: PipelineStepMatrixProps) {
  return (
    <div className="space-y-2.5">
      {STEP_ORDER.map((step) => (
        <StepGroup key={step} step={step} value={steps?.[step]} onChange={(next) => onStepChange(step, next)} />
      ))}
    </div>
  );
}

interface StepGroupProps {
  step: PipelineStep;
  value: StepValue | undefined;
  onChange: (next: StepValue) => void;
}

function StepGroup({ step, value, onChange }: StepGroupProps) {
  const keys = STEP_RESOURCES[step];
  // Defensive: a pre-migration / stale `access_rights` row may lack this step or its
  // `resources` map (the schema backfill may not have run in every environment). Treat a
  // missing/malformed step as fully-off so the owner can simply re-grant — reading
  // `value.enabled` / `value.resources[k]` unguarded would TypeError and crash the InfoTab.
  const enabled = value?.enabled ?? false;
  const resources = value?.resources ?? {};
  const allOn = keys.every((k) => resources[k]);
  // enabled + not-all → indeterminate (includes the "enabled, none granted" case).
  const indeterminate = enabled && !allOn;

  const handleParentToggle = () => {
    // enabled (checked|indeterminate) → uncheck-all; disabled (unchecked) → check-all.
    const next: StepValue = enabled
      ? { enabled: false, resources: allResources(step, false) }
      : { enabled: true, resources: allResources(step, true) };
    log.debug('handleParentToggle', 'parent toggled', { step, to: next.enabled });
    onChange(next);
  };

  const handleResourceToggle = (key: string, on: boolean) => {
    // ON forces the step enabled; OFF keeps enabled (parent goes indeterminate/empty).
    const next: StepValue = { enabled: on ? true : enabled, resources: { ...resources, [key]: on } };
    log.debug('handleResourceToggle', 'resource toggled', { step, resource: key, on });
    onChange(next);
  };

  return (
    <div className="rounded-md border p-2.5">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={enabled && allOn}
          indeterminate={indeterminate}
          onCheckedChange={handleParentToggle}
          aria-label={STEP_LABELS[step]}
        />
        <span>{STEP_LABELS[step]}</span>
      </label>

      <div className="mt-2 grid grid-cols-2 gap-1.5 pl-6">
        {keys.map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={!!resources[key]}
              onCheckedChange={(on) => handleResourceToggle(key, on)}
              aria-label={resourceLabel(key)}
            />
            <span className="truncate">{resourceLabel(key)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
