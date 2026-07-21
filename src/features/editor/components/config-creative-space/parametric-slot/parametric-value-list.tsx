// parametric-value-list.tsx — shared value list for the COUNTRY / RELIGION tabs.
// Master toggle + value rows (checkbox / label / delete) + a local draft-add flow.
// Differs per axis only via props (label / placeholder / validate / value key).
// Master OFF (incl. preview-seed) → rows + "+ Add" greyed-disabled but still shown.

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ParametricValueList');

interface ParametricValueListProps {
  axisLabel: string; // "country" | "religion"
  isEnabled: boolean; // master toggle
  values: { label: string; is_enabled: boolean }[]; // country → code, religion → name
  isPreviewSeed: boolean; // true = greyed seed preview (not persisted)
  inputPlaceholder: string;
  addButtonLabel: string;
  validate: (raw: string) => string | null; // normalize + validate; null = invalid
  onMasterToggle: (next: boolean) => void;
  onValueToggle: (label: string, next: boolean) => void;
  onValueDelete: (label: string) => void;
  onValueAdd: (label: string, checked: boolean) => void;
}

interface DraftValue {
  label: string;
  checked: boolean;
}

export function ParametricValueList({
  axisLabel,
  isEnabled,
  values,
  isPreviewSeed,
  inputPlaceholder,
  addButtonLabel,
  validate,
  onMasterToggle,
  onValueToggle,
  onValueDelete,
  onValueAdd,
}: ParametricValueListProps) {
  const [draft, setDraft] = React.useState<DraftValue | null>(null);

  // Rows/controls are inert while the axis master is OFF (preview-seed included).
  const rowsDisabled = !isEnabled;
  const draftInvalid = draft != null && draft.label.trim().length > 0 && validate(draft.label) == null;

  const startAdd = () => {
    if (rowsDisabled) return;
    log.debug('startAdd', 'new draft row', { axis: axisLabel });
    setDraft({ label: '', checked: false });
  };

  const commitOrDrop = () => {
    if (!draft) return;
    const validated = validate(draft.label);
    if (validated == null) {
      log.debug('commitOrDrop', 'invalid/empty draft dropped', { axis: axisLabel });
      setDraft(null);
      return;
    }
    log.info('commitOrDrop', 'add value', { axis: axisLabel, checked: draft.checked });
    onValueAdd(validated, draft.checked);
    setDraft(null);
  };

  const handleDraftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!draft) return;
      const validated = validate(draft.label);
      if (validated == null) {
        log.debug('handleDraftKeyDown', 'enter on invalid, keeping draft', { axis: axisLabel });
        return; // keep the draft so the user can fix it
      }
      onValueAdd(validated, draft.checked);
      setDraft(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      log.debug('handleDraftKeyDown', 'escape, drop draft', { axis: axisLabel });
      setDraft(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch
          checked={isEnabled}
          onCheckedChange={onMasterToggle}
          aria-label={`Toggle ${axisLabel}`}
        />
        <span className="text-sm font-medium capitalize">{axisLabel}</span>
      </div>

      <div className={cn('flex flex-col', rowsDisabled && 'opacity-50')}>
        {values.map((v) => (
          <div key={v.label} className="flex items-center gap-2 py-1">
            <label
              className={cn(
                'flex flex-1 items-center gap-2 text-sm',
                rowsDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={v.is_enabled}
                disabled={rowsDisabled}
                onChange={(e) => onValueToggle(v.label, e.target.checked)}
                aria-label={`Toggle ${axisLabel} value ${v.label}`}
              />
              <span className="truncate">{v.label}</span>
            </label>
            <button
              type="button"
              disabled={rowsDisabled}
              onClick={() => onValueDelete(v.label)}
              aria-label={`Delete ${axisLabel} value ${v.label}`}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {draft != null && (
          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={draft.checked}
              // Keep input focus (avoid onBlur drop) when toggling the draft checkbox.
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => setDraft({ ...draft, checked: e.target.checked })}
              aria-label={`Enable new ${axisLabel} value`}
            />
            <input
              type="text"
              autoFocus
              value={draft.label}
              placeholder={inputPlaceholder}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              onKeyDown={handleDraftKeyDown}
              onBlur={commitOrDrop}
              aria-label={`New ${axisLabel} value`}
              className={cn(
                'h-7 flex-1 rounded border bg-background px-2 text-sm text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
                draftInvalid ? 'border-red-500 focus:ring-red-500' : 'border-input',
              )}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft(null)}
              aria-label={`Discard new ${axisLabel} value`}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={rowsDisabled}
        onClick={startAdd}
        className={cn(
          'flex w-fit items-center gap-1.5 text-xs font-medium text-primary transition-colors',
          'hover:text-primary/80 disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {addButtonLabel}
      </button>

      {isPreviewSeed && (
        <p className="text-xs italic text-muted-foreground">
          Preview list — enable {axisLabel} to save these values.
        </p>
      )}
    </div>
  );
}
