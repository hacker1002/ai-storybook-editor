// AddCollaboratorModal — overlay to pick ONE existing directory user to grant book
// access. Presentational: candidates (name/avatar/email + existing_status) are
// supplied by the parent (from the useCollaborators hook, refreshed on open); the
// modal only search-filters CLIENT-side (name/email, contains, case-insensitive)
// and reports the picked user_id.
//
// never-hide-disabled-ui: a user who already has a LIVE collaboration
// (existing_status !== null) stays in the list but is DISABLED and shows a status
// badge — it is never filtered out. Only addable rows (existing_status === null)
// are clickable → onPick. Close (X / ESC / click-outside) resets the query.

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createLogger } from '@/utils/logger';
import type { CandidateUser } from './collaboration-space-types';
import { CollaboratorAvatar } from './collaborator-avatar';
import { CollaboratorStatusBadge } from './collaborator-status-badge';

const log = createLogger('Editor', 'AddCollaboratorModal');

interface AddCollaboratorModalProps {
  open: boolean;
  bookId: string;
  candidates: CandidateUser[];
  onPick: (userId: string) => void;
  onClose: () => void;
}

/** Case-insensitive "contains" over a candidate's name + email. */
function matches(candidate: CandidateUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return candidate.name.toLowerCase().includes(q) || candidate.email.toLowerCase().includes(q);
}

export function AddCollaboratorModal({ open, bookId, candidates, onPick, onClose }: AddCollaboratorModalProps) {
  const [query, setQuery] = useState('');

  // Reset the search box each time the modal opens (fresh session per open).
  useEffect(() => {
    if (open) {
      log.debug('effect:open', 'modal opened, resetting query', { bookId, candidateCount: candidates.length });
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = candidates.filter((c) => matches(c, query));

  const handlePick = (candidate: CandidateUser) => {
    if (candidate.existing_status !== null) {
      log.debug('handlePick', 'ignored non-addable pick', { userId: candidate.user_id, existingStatus: candidate.existing_status });
      return;
    }
    log.info('handlePick', 'picking addable user', { userId: candidate.user_id });
    onPick(candidate.user_id);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add collaborator</DialogTitle>
          <DialogDescription>Search a user by name or email to grant access to this book.</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Directory list */}
        <div className="max-h-80 space-y-1 overflow-auto">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found</p>
          ) : (
            visible.map((c) => {
              const isAddable = c.existing_status === null;
              return (
                <button
                  key={c.user_id}
                  type="button"
                  disabled={!isAddable}
                  onClick={() => handlePick(c)}
                  className={[
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    isAddable ? 'cursor-pointer hover:bg-muted/60' : 'cursor-not-allowed opacity-60',
                  ].join(' ')}
                >
                  <CollaboratorAvatar name={c.name} avatarUrl={c.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                      {c.existing_status !== null && <CollaboratorStatusBadge status={c.existing_status} />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
