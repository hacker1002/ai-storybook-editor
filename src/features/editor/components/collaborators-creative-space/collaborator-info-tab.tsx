// CollaboratorInfoTab — the access-rights editor (LanguagesField + PipelineStepMatrix).
// The read-only collaborator header (avatar/name/email/status) was removed — that identity
// already lives in the sidebar row + the parent-rendered detail header. Languages always
// show the full 5-language catalog (AVAILABLE_LANGUAGES), not just the book's enabled set.
//
// The rights matrix is OPTIMISTIC: `localRights` renders instantly, the persist is
// DEBOUNCED 500ms and FLUSHED on unmount (so switching tab/collaborator within the
// window persists the last edit instead of dropping it). The root remounts this tab
// per selection via `key={selected.id}`, and the flush uses the instance's own
// `onRightsChange` binding, so a pending save can never write to the wrong collaborator.
//
// Re-sync WITHOUT a set-state-in-effect loop: we adopt the prop rights during render
// (React "adjusting state on prop change" — same pattern as human-detail-form.tsx,
// NOT an effect, which the repo lints as an error) whenever the prop's serialized
// rights signature changes. That covers BOTH the caller's authoritative rollback (a
// failed UPDATE re-syncs the prop to the DB value) and an external rights change.

import { useState, useRef, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { AVAILABLE_LANGUAGES } from '@/constants/editor-constants';
import { Checkbox } from '@/components/ui/checkbox';
import { PipelineStepMatrix } from './pipeline-step-matrix';
import {
  STEP_RESOURCES,
  normalizeAccessRights,
  type AccessRights,
  type Collaboration,
  type PipelineStep,
} from './collaboration-space-types';

const log = createLogger('Editor', 'CollaboratorInfoTab');

const RIGHTS_SAVE_DEBOUNCE_MS = 500;

const STEP_ORDER: PipelineStep[] = ['sketch', 'illustration', 'retouch'];

interface CollaboratorInfoTabProps {
  collaboration: Collaboration;
  isSaving: boolean;
  onRightsChange: (next: AccessRights) => void;
}

/** Display label for a language code: "English (en_US)" when known, else the raw code.
 *  Strips a trailing region parenthetical from the catalog name (e.g. "English (US)" →
 *  "English", "中文 (简体)" → "中文") so appending the code never double-parens. */
function languageLabel(code: string): string {
  const known = AVAILABLE_LANGUAGES.find((l) => l.code === code);
  if (!known?.name) return code;
  const base = known.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return `${base} (${code})`;
}

/**
 * Canonical VALUE-ONLY signature of the rights, used to detect a genuine prop change
 * (rollback / external edit) for the render-time resync. NOT a raw JSON.stringify:
 * Postgres `jsonb` does not preserve key order, so a DB reload can reorder keys without
 * changing values — a raw stringify would then resync spuriously. Deterministic over the
 * fixed shape (sorted languages + fixed step/resource order).
 */
function rightsSignature(r: AccessRights): string {
  const langs = [...r.languages].sort().join(',');
  const steps = STEP_ORDER.map((s) => {
    const step = r.steps[s];
    const res = STEP_RESOURCES[s].map((k) => `${k}:${step?.resources?.[k] ? 1 : 0}`).join('|');
    return `${s}=${step?.enabled ? 1 : 0}[${res}]`;
  }).join(';');
  return `${langs}#${steps}`;
}

export function CollaboratorInfoTab({
  collaboration,
  isSaving,
  onRightsChange,
}: CollaboratorInfoTabProps) {
  // Normalize the (possibly legacy/partial) DB rights to the strict shape ONCE at the
  // boundary — a pre-migration row may lack `languages`/`steps` and would otherwise
  // TypeError in the signature / languages field / matrix below.
  const rights = normalizeAccessRights(collaboration.access_rights);

  // Adopt prop rights during render whenever their VALUE signature changes (rollback /
  // external change). Not an effect — see file header. Value-only signature so a jsonb
  // key reorder on a DB reload does not resync spuriously.
  const propSignature = rightsSignature(rights);
  const [syncedSignature, setSyncedSignature] = useState(propSignature);
  const [localRights, setLocalRights] = useState<AccessRights>(rights);
  if (propSignature !== syncedSignature) {
    log.debug('resync', 'adopting prop rights (rollback/external change)', { collaboratorId: collaboration.id });
    setSyncedSignature(propSignature);
    setLocalRights(rights);
  }

  // Debounced persist WITH flush-on-unmount. A plain clear-on-unmount debounce would
  // silently DROP the last edit when the user switches tab / collaborator within the
  // 500ms window — real data loss for a permissions editor. We flush instead: `saveRef`
  // holds the latest `onRightsChange`, which closes over THIS instance's collaborator id
  // (the parent remounts per selection via key), so flushing on unmount targets the
  // correct row and cannot cross-write. Timer/pending live in refs updated only in
  // effects/handlers (never render body) per the React-19 rules.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<AccessRights | null>(null);
  const saveRef = useRef(onRightsChange);
  useEffect(() => {
    saveRef.current = onRightsChange;
  }, [onRightsChange]);

  const flushSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending !== null) {
      pendingRef.current = null;
      log.debug('flushSave', 'flushing pending rights', { collaboratorId: collaboration.id });
      saveRef.current(pending);
    }
  }, [collaboration.id]);

  // Flush any pending edit when this tab unmounts (tab switch / selection remount / close).
  useEffect(() => flushSave, [flushSave]);

  const scheduleSave = useCallback(
    (next: AccessRights) => {
      pendingRef.current = next;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) {
          log.debug('scheduleSave', 'debounce elapsed, persisting rights', { collaboratorId: collaboration.id });
          saveRef.current(pending);
        }
      }, RIGHTS_SAVE_DEBOUNCE_MS);
    },
    [collaboration.id],
  );

  const applyRights = (next: AccessRights) => {
    setLocalRights(next); // optimistic — instant UI
    scheduleSave(next); // persist after the quiet window (flushed if unmounted first)
  };

  const toggleLanguage = (code: string) => {
    const has = localRights.languages.includes(code);
    log.debug('toggleLanguage', 'language toggled', { code, on: !has });
    const languages = has ? localRights.languages.filter((c) => c !== code) : [...localRights.languages, code];
    applyRights({ ...localRights, languages });
  };

  const handleStepChange = (step: PipelineStep, next: AccessRights['steps'][PipelineStep]) => {
    log.debug('handleStepChange', 'step rights changed', { step, enabled: next.enabled });
    applyRights({ ...localRights, steps: { ...localRights.steps, [step]: next } });
  };

  return (
    <div className="space-y-5 p-4">
      {/* LANGUAGES — always the full catalog (5); checked = code ∈ access_rights.languages.
          The read-only collaborator header was removed (avatar/name/email/status live in the
          sidebar row + parent detail header). */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Languages</h4>
          {isSaving && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
        <div className="space-y-1.5">
          {AVAILABLE_LANGUAGES.map(({ code }) => (
            <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={localRights.languages.includes(code)}
                onCheckedChange={() => toggleLanguage(code)}
                aria-label={languageLabel(code)}
              />
              <span className="truncate">{languageLabel(code)}</span>
            </label>
          ))}
        </div>
      </section>

      {/* PIPELINE STEP — tri-state matrix (see pipeline-step-matrix.tsx). */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline Step</h4>
        <PipelineStepMatrix steps={localRights.steps} onStepChange={handleStepChange} />
      </section>
    </div>
  );
}
