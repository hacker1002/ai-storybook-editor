// CollaboratorsCreativeSpace — owner-scoped space for managing a book's collaborators.
// Mirrors shares-creative-space (direct-Supabase hook, no global store): sidebar list
// + filter/add/remove on the left, a per-collaborator detail area (Info | Log tabs) on
// the right, and the AddCollaboratorModal.
//
// SELECTION is DERIVED (no set-state-in-effect self-heal): a just-added collaborator
// wins, then the user's valid current selection, then the first row, then null. This
// converges without effects and satisfies the React-19 lint rules.
//
// Owner-only: gated defensively on `book.owner_id === auth.uid()`. Non-owners never
// reach this space through the normal UI (icon-rail gating), but the gate stays.
//
// DETAIL area (Phase 04): TabBar + root-rendered lifecycle actions (Send / Suspend,
// enable-by-status) on top; below, the real <CollaboratorInfoTab/> (activeTab==='info')
// or <CollaboratorActivityLogTab/> (activeTab==='log'). Both are remounted per selection
// via `key={selected.id}` so per-collaborator local state (debounce buffer, log filters)
// resets cleanly and a stale debounce can never write to the wrong row.

import { useMemo, useState } from 'react';
import { Users, Send, PauseCircle, PlayCircle } from 'lucide-react';
import { useCurrentBook } from '@/stores/book-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';
import { useCollaborators } from './hooks/use-collaborators';
import { getBookLanguages } from './get-book-languages';
import { CollaboratorSidebar } from './collaborator-sidebar';
import { applyFilter, EMPTY_FILTER, type CollaboratorFilter } from './collaborator-filter';
import { AddCollaboratorModal } from './add-collaborator-modal';
import { CollaboratorInfoTab } from './collaborator-info-tab';
import { CollaboratorActivityLogTab } from './collaborator-activity-log-tab';
import type { CollabStatus } from './collaboration-space-types';

const log = createLogger('Editor', 'CollaboratorsCreativeSpace');

type DetailTab = 'info' | 'log';

/** Shown when a non-owner reaches the space (defensive gate). */
function OwnerOnlyEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">Collaborators</h3>
      <p className="max-w-md text-muted-foreground">Only the book owner can manage collaborators.</p>
    </div>
  );
}

/** Two-tab bar (Info | Log) owned by the root. */
function TabBar({ activeTab, onChange }: { activeTab: DetailTab; onChange: (tab: DetailTab) => void }) {
  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'log', label: 'Log' },
  ];
  return (
    <div className="flex items-center gap-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={activeTab === t.key}
          onClick={() => onChange(t.key)}
          className={[
            'rounded-md px-3 py-1 text-sm font-medium',
            activeTab === t.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/60',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Root-rendered lifecycle actions for the selected collaborator (design §02 2.6:
 * "parent render, InfoTab callback"). Enable-by-status: Send only when pending(0);
 * Suspend/Unsuspend only when active(2)/suspended(3). Both stay VISIBLE-but-disabled
 * otherwise (never hidden) so the available lifecycle actions are always discoverable.
 */
function CollaboratorHeaderActions({
  status,
  isSaving,
  onSend,
  onSuspendToggle,
}: {
  status: CollabStatus;
  isSaving: boolean;
  onSend: () => void;
  onSuspendToggle: () => void;
}) {
  const canSend = status === 0; // pending → invited
  const canToggleSuspend = status === 2 || status === 3; // active ↔ suspended
  const isSuspended = status === 3;
  const SuspendIcon = isSuspended ? PlayCircle : PauseCircle;
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={!canToggleSuspend || isSaving} onClick={onSuspendToggle}>
        <SuspendIcon className="mr-1.5 h-4 w-4" />
        {isSuspended ? 'Unsuspend' : 'Suspend'}
      </Button>
      <Button variant="default" size="sm" disabled={!canSend || isSaving} onClick={onSend}>
        <Send className="mr-1.5 h-4 w-4" />
        Send
      </Button>
    </div>
  );
}

export function CollaboratorsCreativeSpace() {
  const currentBook = useCurrentBook();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const bookId = currentBook?.id ?? '';
  const isOwner = !!currentBook && currentBook.owner_id === currentUserId;

  const {
    collaborators,
    candidatesMap,
    isLoading,
    isSaving,
    addCollaborator,
    updateRights,
    sendInvite,
    toggleSuspend,
    removeCollaborator,
    reloadCandidates,
  } = useCollaborators(bookId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justAddedUserId, setJustAddedUserId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [filter, setFilter] = useState<CollaboratorFilter>(EMPTY_FILTER);

  const bookLanguages = useMemo(() => getBookLanguages(currentBook), [currentBook]);
  const candidates = useMemo(() => Array.from(candidatesMap.values()), [candidatesMap]);

  // The sidebar renders this same filtered list; deriving selection from it (not the
  // full list) keeps the highlighted row and the detail panel in sync with the active
  // filter — a selection (or a just-added Pending row) that the filter excludes never
  // lands in the panel without a matching sidebar row.
  const filtered = useMemo(() => applyFilter(collaborators, filter), [collaborators, filter]);

  // Derived selection (no set-state-in-effect), scoped to the FILTERED list. Priority:
  // just-added row → valid current selection → first visible row → null. `justAddedUserId`
  // is keyed by user_id so it resolves once the async add reload materialises the row
  // (and only while that row passes the active filter).
  const justAddedId = justAddedUserId
    ? filtered.find((c) => c.user_id === justAddedUserId)?.id ?? null
    : null;
  const selectedIsValid = selectedId != null && filtered.some((c) => c.id === selectedId);
  const effectiveSelectedId = justAddedId ?? (selectedIsValid ? selectedId : filtered[0]?.id ?? null);
  const selected = filtered.find((c) => c.id === effectiveSelectedId) ?? null;

  const handleSelect = (id: string) => {
    log.debug('handleSelect', 'select collaborator', { id });
    setJustAddedUserId(null); // an explicit user pick overrides the just-added preference
    setSelectedId(id);
  };

  const handleOpenAddModal = () => {
    log.info('handleOpenAddModal', 'opening add-collaborator modal', { bookId });
    void reloadCandidates(); // refresh existing_status before showing the directory
    setIsAddModalOpen(true);
  };

  const handlePick = async (userId: string) => {
    log.info('handlePick', 'adding collaborator from modal', { userId });
    setIsAddModalOpen(false);
    setActiveTab('info');
    await addCollaborator(userId);
    // Row now present (addCollaborator reloads internally) → derivation selects it.
    setJustAddedUserId(userId);
  };

  const handleRemove = async (id: string) => {
    log.info('handleRemove', 'removing collaborator', { id });
    if (selectedId === id) setSelectedId(null); // fall back to the derived first row
    await removeCollaborator(id);
  };

  const handleFilterChange = (next: CollaboratorFilter) => {
    log.debug('handleFilterChange', 'filter changed', {
      languages: next.languages.length,
      steps: next.steps.length,
      statuses: next.statuses.length,
    });
    setFilter(next);
  };

  // Defensive owner gate (after hooks so hook order is stable).
  if (!isOwner) {
    log.debug('render', 'non-owner blocked', { hasBook: !!currentBook });
    return <OwnerOnlyEmptyState />;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <CollaboratorSidebar
        collaborators={collaborators}
        selectedId={effectiveSelectedId}
        filter={filter}
        bookLanguages={bookLanguages}
        onSelect={handleSelect}
        onAdd={handleOpenAddModal}
        onRemove={handleRemove}
        onFilterChange={handleFilterChange}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b px-3 py-2">
              <TabBar activeTab={activeTab} onChange={setActiveTab} />
              <CollaboratorHeaderActions
                status={selected.status}
                isSaving={isSaving}
                onSend={() => sendInvite(selected.id)}
                onSuspendToggle={() => toggleSuspend(selected.id)}
              />
            </div>
            <div className="flex-1 overflow-auto">
              {activeTab === 'info' ? (
                <CollaboratorInfoTab
                  key={selected.id}
                  collaboration={selected}
                  bookLanguages={bookLanguages.map((l) => l.code)}
                  isSaving={isSaving}
                  onRightsChange={(next) => updateRights(selected.id, next)}
                />
              ) : (
                <CollaboratorActivityLogTab key={selected.id} bookId={bookId} actorUserId={selected.user_id} />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">No collaborators yet</h3>
            <p className="text-muted-foreground">Add a collaborator to configure their access.</p>
          </div>
        )}
      </div>

      <AddCollaboratorModal
        open={isAddModalOpen}
        bookId={bookId}
        candidates={candidates}
        onPick={handlePick}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}
