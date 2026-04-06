import { useState, useEffect } from 'react';
import { Share2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentBook } from '@/stores/book-store';
import { createLogger } from '@/utils/logger';
import { useShareLinks } from './hooks';
import { SharesSidebar } from './shares-sidebar';
import { ShareLinkDetailPanel } from './share-link-detail-panel';

const log = createLogger('Editor', 'SharesCreativeSpace');

function EmptyState({ onCreateLink }: { onCreateLink: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Share2 className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">No share links yet</h3>
      <p className="mb-4 max-w-md text-muted-foreground">
        Create a share link to give others access to your book
      </p>
      <Button onClick={onCreateLink}>
        <Plus className="mr-2 h-4 w-4" />
        Create Share Link
      </Button>
    </div>
  );
}

export function SharesCreativeSpace() {
  const currentBook = useCurrentBook();
  const bookId = currentBook?.id ?? '';

  const { shareLinks, isLoading, isSaving, createShareLink, updateShareLink, deleteShareLink } =
    useShareLinks(bookId);

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-select logic: select first link on mount, handle deletions
  useEffect(() => {
    if (shareLinks.length > 0 && !selectedLinkId) {
      setSelectedLinkId(shareLinks[0].id);
    } else if (
      shareLinks.length > 0 &&
      selectedLinkId &&
      !shareLinks.find((l) => l.id === selectedLinkId)
    ) {
      // Selected link was deleted — select first remaining
      setSelectedLinkId(shareLinks[0].id);
    } else if (shareLinks.length === 0) {
      setSelectedLinkId(null);
    }
  }, [shareLinks, selectedLinkId]);

  const handleSelect = (linkId: string) => {
    log.debug('handleSelect', 'selected link', { linkId });
    setSelectedLinkId(linkId);
  };

  const handleCreate = async () => {
    log.info('handleCreate', 'creating new share link');
    setIsCreating(true);
    await createShareLink();
    setIsCreating(false);
    // Auto-select will pick up the new link via useEffect
  };

  const handleDelete = async (linkId: string) => {
    log.info('handleDelete', 'deleting share link', { linkId });
    await deleteShareLink(linkId);
  };

  const selectedLink = shareLinks.find((l) => l.id === selectedLinkId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <SharesSidebar
        shareLinks={shareLinks}
        selectedLinkId={selectedLinkId}
        isCreating={isCreating}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-hidden">
        {selectedLink ? (
          <ShareLinkDetailPanel
            link={selectedLink}
            isSaving={isSaving}
            onUpdate={updateShareLink}
          />
        ) : (
          <EmptyState onCreateLink={handleCreate} />
        )}
      </div>
    </div>
  );
}
