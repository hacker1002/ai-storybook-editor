// InvitationAcceptModal — presentational Dialog for ONE collaboration invite.
// Shows cover (+fallback), title, owner, granted steps/languages chips, and a
// (i/total) counter when queued. Accept POSTs; Cancel/Esc/outside-click dismiss
// for this session only (invite stays status=1). See design §3.

import { ImageIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { InvitationSummary } from '@/types/collaboration';

const STEP_LABELS: Record<string, string> = {
  sketch: 'Sketch',
  illustration: 'Illustration',
  retouch: 'Retouch',
};

interface InvitationAcceptModalProps {
  invitation: InvitationSummary;
  index: number; // 0-based position in the queue
  total: number; // queue length — counter shown only when > 1
  isAccepting: boolean;
  onAccept: (bookId: string) => void;
  onCancel: () => void; // dismiss (NOT a permanent decline)
}

function ownerInitial(name: string | null): string {
  return name?.trim()?.[0]?.toUpperCase() ?? '?';
}

export function InvitationAcceptModal({
  invitation,
  index,
  total,
  isAccepting,
  onAccept,
  onCancel,
}: InvitationAcceptModalProps) {
  const { book_id, book_title, book_cover, owner_name, owner_avatar, access_rights } = invitation;

  const grantedSteps = Object.keys(STEP_LABELS).filter(
    (step) => access_rights.steps?.[step]?.enabled
  );
  const grantedLangs = access_rights.languages ?? [];
  const coverUrl = book_cover?.thumbnail_url ?? null;

  // Radix fires onOpenChange(false) on Esc / outside-click / close button —
  // all three are "Cancel" (dismiss). Never treat as Accept. Ignore while
  // accepting so an in-flight POST can't be interrupted mid-flight.
  const handleOpenChange = (open: boolean) => {
    if (!open && !isAccepting) onCancel();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Collaboration invitation</span>
            {total > 1 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({index + 1}/{total})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {coverUrl ? (
              <img src={coverUrl} alt={book_title} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="truncate text-base font-semibold">{book_title}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Avatar className="h-6 w-6">
                {owner_avatar && <AvatarImage src={owner_avatar} alt={owner_name ?? 'Owner'} />}
                <AvatarFallback className="text-xs">{ownerInitial(owner_name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">
                <span className="font-medium text-foreground">{owner_name ?? 'Someone'}</span>{' '}
                invited you to collaborate.
              </span>
            </div>
          </div>
        </div>

        {(grantedSteps.length > 0 || grantedLangs.length > 0) && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
            <p className="font-medium">You'll have access to:</p>
            {grantedSteps.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Steps:</span>
                {grantedSteps.map((step) => (
                  <span
                    key={step}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {STEP_LABELS[step]}
                  </span>
                ))}
              </div>
            )}
            {grantedLangs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Languages:</span>
                {grantedLangs.map((lang) => (
                  <span
                    key={lang}
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={isAccepting}>
            Cancel
          </Button>
          <Button onClick={() => onAccept(book_id)} disabled={isAccepting}>
            {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
