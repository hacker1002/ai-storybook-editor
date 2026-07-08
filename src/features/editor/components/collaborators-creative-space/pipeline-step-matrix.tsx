// PipelineStepMatrix — the access_rights.steps editor. Single-column, indented TREE
// (new-mock layout, replaces the old 2-column bordered cards):
//
//   [tri] SKETCH                       ← step parent (uppercase section header)
//     [ ] Characters                   ← leaf resource   (level 1)
//     [ ] Props
//     [ ] Stages
//     [tri] Spreads                    ← spread SUB-parent (level 1, tri-state)
//       [ ] Image                      ← spread child     (level 2)
//       [ ] Textbox
//   [tri] ILLUSTRATION
//     … + [ ] Branches (level-1 leaf after the Spreads subtree)
//   [tri] RETOUCH  → Objects / Quiz / Remixes (flat, no Spreads subtree)
//
// TWO nested tri-states (both mirror the same "parent independent of children" rule the
// step level already uses — see design §02 2.5, intentional divergence from the recording):
//
//   STEP parent (enabled):  !enabled → off · enabled & allResourcesOn → on · else indeterminate
//   SPREAD sub-parent (`spreads` bool): !spreads → off · spreads & image&textbox → on · else indeterminate
//
// The `spreads` boolean is a REAL gated resource (icon-rail `spread` entity, ENTITY_RESOURCE_MAP)
// AND the parent of image/textbox — image/textbox are spread layers, not standalone tools
// (neither is in ENTITY_RESOURCE_MAP). Cascade (confirmed w/ owner):
//   • either child ON  → force `spreads` = true              (child implies spread access)
//   • Spreads parent ON → default both children = true
//   • child OFF        → keep `spreads` true (parent → indeterminate); only the Spreads
//                        parent (or the Step parent) turns `spreads` off — never auto-disable.
//
// Data shape is UNCHANGED (flat resources incl. spreads/image/textbox) — this is a
// render+toggle change only, no DB/migration impact.

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

/** Parent key of the spread subtree + its layer children (rendered indented under it). */
const SPREAD_PARENT_KEY = 'spreads';
const SPREAD_CHILD_KEYS = ['image', 'textbox'] as const;

/** Spread-layer children present in this step (empty when the step has no `spreads`). */
function spreadChildrenFor(step: PipelineStep): string[] {
  const keys = STEP_RESOURCES[step];
  if (!keys.includes(SPREAD_PARENT_KEY)) return [];
  return SPREAD_CHILD_KEYS.filter((k) => keys.includes(k));
}

type StepValue = AccessRights['steps'][PipelineStep];

/** All resources of a step set to `on` (used by the step parent check-all / uncheck-all). */
function allResources(step: PipelineStep, on: boolean): Record<string, boolean> {
  return Object.fromEntries(STEP_RESOURCES[step].map((k) => [k, on] as const)) as Record<string, boolean>;
}

interface PipelineStepMatrixProps {
  steps: AccessRights['steps'];
  onStepChange: (step: PipelineStep, next: StepValue) => void;
}

export function PipelineStepMatrix({ steps, onStepChange }: PipelineStepMatrixProps) {
  return (
    <div className="space-y-4">
      {STEP_ORDER.map((step) => (
        <StepGroup key={step} step={step} value={steps?.[step]} onChange={(next) => onStepChange(step, next)} />
      ))}
    </div>
  );
}

/** One row of the tree: checkbox + label, indented by `level` (0 step · 1 resource · 2 child). */
function MatrixRow({
  level,
  checked,
  indeterminate,
  onToggle,
  label,
  labelClassName,
}: {
  level: 0 | 1 | 2;
  checked: boolean;
  indeterminate?: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  labelClassName: string;
}) {
  const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-12';
  return (
    <label className={`flex cursor-pointer items-center gap-2 ${indent}`}>
      <Checkbox checked={checked} indeterminate={indeterminate} onCheckedChange={onToggle} aria-label={label} />
      <span className={labelClassName}>{label}</span>
    </label>
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
  // `resources` map (schema backfill may not have run everywhere). Treat a missing/malformed
  // step as fully-off — reading `value.enabled` / `value.resources[k]` unguarded would
  // TypeError and crash the InfoTab.
  const enabled = value?.enabled ?? false;
  const resources = value?.resources ?? {};

  const childKeys = spreadChildrenFor(step);
  const childSet = new Set(childKeys);
  // Top level = every resource except the spread children (those nest under Spreads).
  const topKeys = keys.filter((k) => !childSet.has(k));

  // ── Step parent tri-state (enabled + not-all → indeterminate, incl. "enabled, none granted"). ──
  const allOn = keys.every((k) => resources[k]);
  const stepIndeterminate = enabled && !allOn;

  const handleStepToggle = () => {
    const next: StepValue = enabled
      ? { enabled: false, resources: allResources(step, false) }
      : { enabled: true, resources: allResources(step, true) };
    log.debug('handleStepToggle', 'step toggled', { step, to: next.enabled });
    onChange(next);
  };

  // ── Leaf resource (characters/props/stages/branches/objects/quiz/remixes). ──
  const handleLeafToggle = (key: string, on: boolean) => {
    // ON forces the step enabled; OFF keeps enabled (parent → indeterminate/empty).
    const next: StepValue = { enabled: on ? true : enabled, resources: { ...resources, [key]: on } };
    log.debug('handleLeafToggle', 'resource toggled', { step, resource: key, on });
    onChange(next);
  };

  // ── Spread sub-parent tri-state (`spreads` bool as parent of image/textbox). ──
  const spreadsOn = !!resources[SPREAD_PARENT_KEY];
  const spreadChildrenAllOn = childKeys.every((k) => resources[k]);
  const spreadIndeterminate = spreadsOn && !spreadChildrenAllOn;

  const handleSpreadToggle = () => {
    // On (checked|indeterminate) → clear spreads + both children; off → set all three on.
    const turnOn = !spreadsOn;
    const updates: Record<string, boolean> = { [SPREAD_PARENT_KEY]: turnOn };
    for (const k of childKeys) updates[k] = turnOn;
    const next: StepValue = { enabled: turnOn ? true : enabled, resources: { ...resources, ...updates } };
    log.debug('handleSpreadToggle', 'spread sub-parent toggled', { step, to: turnOn });
    onChange(next);
  };

  const handleSpreadChildToggle = (key: string, on: boolean) => {
    // ON → child on + force spreads on (child implies spread access) + step enabled.
    // OFF → child off, KEEP spreads on (only the Spreads/Step parent turns spreads off).
    const updates: Record<string, boolean> = { [key]: on };
    if (on) updates[SPREAD_PARENT_KEY] = true;
    const next: StepValue = { enabled: on ? true : enabled, resources: { ...resources, ...updates } };
    log.debug('handleSpreadChildToggle', 'spread child toggled', { step, child: key, on });
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {/* Step parent — uppercase section header + tri-state checkbox. */}
      <MatrixRow
        level={0}
        checked={enabled && allOn}
        indeterminate={stepIndeterminate}
        onToggle={handleStepToggle}
        label={STEP_LABELS[step]}
        labelClassName="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      />

      {topKeys.map((key) =>
        key === SPREAD_PARENT_KEY && childKeys.length > 0 ? (
          <div key={key} className="space-y-1.5">
            <MatrixRow
              level={1}
              checked={spreadsOn && spreadChildrenAllOn}
              indeterminate={spreadIndeterminate}
              onToggle={handleSpreadToggle}
              label={resourceLabel(key)}
              labelClassName="text-sm"
            />
            {childKeys.map((child) => (
              <MatrixRow
                key={child}
                level={2}
                checked={!!resources[child]}
                onToggle={(on) => handleSpreadChildToggle(child, on)}
                label={resourceLabel(child)}
                labelClassName="text-sm"
              />
            ))}
          </div>
        ) : (
          <MatrixRow
            key={key}
            level={1}
            checked={!!resources[key]}
            onToggle={(on) => handleLeafToggle(key, on)}
            label={resourceLabel(key)}
            labelClassName="text-sm"
          />
        ),
      )}
    </div>
  );
}
