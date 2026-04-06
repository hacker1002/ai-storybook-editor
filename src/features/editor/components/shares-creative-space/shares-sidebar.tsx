import { useState } from 'react';
import { Globe2, Lock, Plus, Trash2 } from 'lucide-react';
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
import type { ShareLink } from './share-link-types';

const log = createLogger('Editor', 'SharesSidebar');

interface SharesSidebarProps {
  shareLinks: ShareLink[];
  selectedLinkId: string | null;
  isCreating: boolean;
  onSelect: (linkId: string) => void;
  onCreate: () => void;
  onDelete: (linkId: string) => void;
}

export function SharesSidebar({
  shareLinks,
  selectedLinkId,
  isCreating,
  onSelect,
  onCreate,
  onDelete,
}: SharesSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteRequest = (linkId: string) => {
    log.debug('handleDeleteRequest', 'requesting delete confirmation', { linkId });
    setConfirmDeleteId(linkId);
  };

  const handleDeleteConfirm = () => {
    if (!confirmDeleteId) return;
    log.info('handleDeleteConfirm', 'confirmed delete', { linkId: confirmDeleteId });
    onDelete(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  const handleDeleteCancel = () => {
    log.debug('handleDeleteCancel', 'delete cancelled');
    setConfirmDeleteId(null);
  };

  const linkToDelete = shareLinks.find((l) => l.id === confirmDeleteId);

  return (
    <>
      <aside
        role="navigation"
        aria-label="Share links sidebar"
        className="flex h-full w-[280px] flex-col border-r bg-muted/30"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Share Links</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreate}
            disabled={isCreating}
            title="Create share link"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-2">
          {shareLinks.map((link) => {
            const isSelected = selectedLinkId === link.id;
            const isHovered = hoveredId === link.id;
            const PrivacyIcon = link.privacy === 1 ? Globe2 : Lock;

            return (
              <div
                key={link.id}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => {
                  log.debug('onSelect', 'link selected', { linkId: link.id });
                  onSelect(link.id);
                }}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(link.id)}
                onMouseEnter={() => setHoveredId(link.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/60',
                ].join(' ')}
              >
                <PrivacyIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{link.name}</span>
                {isHovered && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Delete share link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRequest(link.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete share link?</AlertDialogTitle>
            <AlertDialogDescription>
              "{linkToDelete?.name}" will be permanently deleted. Anyone with this link will
              lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
