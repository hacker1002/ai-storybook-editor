// collab-edit-badge.tsx — Shared 2-state collab lock affordance for the per-entity / per-spread
// HELD edit session (ADR-044 §Revision 2026-07-10). NEVER hidden (memory: never hide disabled UI):
//   • editable  → "Editing" pill (this editor owns the resource's lock).
//   • otherwise → greyed pill: "Locking…" while acquiring, else the idle prompt.
// Reused by the 3 entity creative spaces (characters/props/stages); the retouch/objects space keeps
// its own inline variant. Presentational only — the caller owns the lock lifecycle.

import { Users, Lock } from 'lucide-react';
import type { SessionStatus } from '@/stores/resource-lock-store';

interface CollabEditBadgeProps {
  /** This editor holds the lock AND the held resource is the one on screen. */
  editable: boolean;
  /** Session lifecycle — 'acquiring' renders the "Locking…" transitional label. */
  status: SessionStatus;
  /** Prompt shown when idle/not held (e.g. "Click an entity to edit"). */
  idleLabel: string;
  /** Pill shown while editable. */
  editingLabel?: string;
}

export function CollabEditBadge({
  editable,
  status,
  idleLabel,
  editingLabel = 'Editing',
}: CollabEditBadgeProps) {
  if (editable) {
    return (
      <div
        className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground select-none"
        title="You are editing this — changes save when you switch away"
      >
        <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span>{editingLabel}</span>
      </div>
    );
  }
  return (
    <div
      className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground select-none"
      title="Locked — click to start editing"
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{status === 'acquiring' ? 'Locking…' : idleLabel}</span>
    </div>
  );
}

export default CollabEditBadge;
