// CollaboratorSidebar — left panel of the CollaboratorsCreativeSpace: filter funnel
// + title + [+] add button, then the (client-filtered) collaborator list. Each row
// shows avatar/name/email/status; hovering reveals a trash button that routes
// through an AlertDialog confirm (sidebars never own a destructive hotkey — remove
// is always confirm-gated). Empty list shows a "No collaborators yet" + [+] state.
//
// The AlertDialog uses the default z-50: this space is a plain panel (no spread
// canvas with z-700 textboxes underneath), so no CANVAS_CONFIRM_DIALOG_Z lift is
// needed here (mirrors shares-sidebar).

import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createLogger } from '@/utils/logger';
import type { Language } from '@/types/editor';
import type { Collaboration } from './collaboration-space-types';
import { applyFilter, type CollaboratorFilter } from './collaborator-filter';
import { CollaboratorAvatar } from './collaborator-avatar';
import { CollaboratorStatusBadge } from './collaborator-status-badge';
import { CollaboratorFilterPopover } from './collaborator-filter-popover';

const log = createLogger('Editor', 'CollaboratorSidebar');

interface CollaboratorSidebarProps {
  collaborators: Collaboration[];
  selectedId: string | null;
  filter: CollaboratorFilter;
  bookLanguages: Language[]; // enabled-language options for the FilterPopover
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onFilterChange: (next: CollaboratorFilter) => void;
}

export function CollaboratorSidebar({
  collaborators,
  selectedId,
  filter,
  bookLanguages,
  onSelect,
  onAdd,
  onRemove,
  onFilterChange,
}: CollaboratorSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const filtered = applyFilter(collaborators, filter);

  const handleRemoveRequest = (id: string) => {
    log.debug('handleRemoveRequest', 'requesting remove confirmation', { id });
    setPendingRemoveId(id);
  };

  const handleRemoveConfirm = () => {
    if (!pendingRemoveId) return;
    log.info('handleRemoveConfirm', 'confirmed remove', { id: pendingRemoveId });
    onRemove(pendingRemoveId);
    setPendingRemoveId(null);
  };

  const handleRemoveCancel = () => {
    log.debug('handleRemoveCancel', 'remove cancelled');
    setPendingRemoveId(null);
  };

  const rowToRemove = collaborators.find((c) => c.id === pendingRemoveId);
  const rowToRemoveName = rowToRemove?.profile?.name ?? 'this collaborator';

  return (
    <>
      <aside
        role="navigation"
        aria-label="Collaborators sidebar"
        className="flex h-full w-[280px] flex-col border-r bg-muted/30"
      >
        {/* Header: filter funnel + title + add (h-14 = canonical editor header height,
            shared with the detail header so both panels align). */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
            <CollaboratorFilterPopover
              filter={filter}
              bookLanguages={bookLanguages}
              onFilterChange={onFilterChange}
            />
            <h2 className="text-sm font-semibold">Collaborators</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onAdd} title="Add collaborator">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* List / empty state */}
        {collaborators.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Users className="h-9 w-9 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No collaborators yet</p>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add collaborator
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No collaborators match the filter
              </p>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedId === c.id;
                const isHovered = hoveredId === c.id;
                const name = c.profile?.name ?? 'Unknown user';
                const email = c.profile?.email;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() => onSelect(c.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={[
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                      isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <CollaboratorAvatar name={c.profile?.name} avatarUrl={c.profile?.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm font-medium">{name}</span>
                        <CollaboratorStatusBadge status={c.status} />
                      </div>
                      {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
                    </div>
                    {isHovered && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        title="Remove collaborator"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRequest(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </aside>

      {/* Remove confirmation (confirm-gated; no destructive hotkey in the sidebar) */}
      <AlertDialog open={pendingRemoveId !== null} onOpenChange={(open) => !open && handleRemoveCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove collaborator?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {rowToRemoveName} from this book? They will lose access. You can add them again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRemoveCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveConfirm}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
