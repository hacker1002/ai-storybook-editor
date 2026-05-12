// humans-page.tsx — Route /humans. Orchestrates header + toolbar + list + create/delete portals.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { HumansHeader } from '@/features/humans/components/humans-header';
import { HumansToolbar } from '@/features/humans/components/humans-toolbar';
import { HumansList } from '@/features/humans/components/humans-list';
import { HumansListSkeleton } from '@/features/humans/components/humans-list-skeleton';
import { CreateHumanModal } from '@/features/humans/components/create-human-modal';
import { DeleteHumanDialog } from '@/features/humans/components/delete-human-dialog';
import { applyFilters } from '@/features/humans/utils/human-filters';
import { DEFAULT_HUMANS_FILTERS } from '@/features/humans/constants';
import {
  useHumans,
  useHumansActions,
  useHumansLoading,
} from '@/stores/humans-store';
import type { Human, HumansFilterState } from '@/types/human';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'HumansPage');

export function HumansPage() {
  const humans = useHumans();
  const isLoading = useHumansLoading();
  const { fetchHumans } = useHumansActions();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<HumansFilterState>(DEFAULT_HUMANS_FILTERS);
  const [deletingHuman, setDeletingHuman] = useState<Human | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    log.info('mount', 'fetching humans');
    void fetchHumans();
  }, [fetchHumans]);

  const filtered = useMemo(() => applyFilters(humans, filters), [humans, filters]);

  const handleOpenCreate = useCallback(() => setIsCreateOpen(true), []);
  const handleCloseCreate = useCallback(() => setIsCreateOpen(false), []);
  const handleOpenDetail = useCallback(
    (id: string) => navigate(`/humans/${id}`),
    [navigate],
  );
  const handleOpenDelete = useCallback((h: Human) => setDeletingHuman(h), []);
  const handleCloseDelete = useCallback(() => setDeletingHuman(null), []);

  const handleCreated = useCallback(
    (human: Human) => {
      log.info('handleCreated', 'human created', { id: human.id });
      setIsCreateOpen(false);
      toast.success('Human created');
      navigate(`/humans/${human.id}`);
    },
    [navigate],
  );

  const handleDeleted = useCallback(() => {
    log.info('handleDeleted', 'human deleted');
    toast.success('Human deleted');
    setDeletingHuman(null);
  }, []);

  return (
    <main
      aria-labelledby="humans-heading"
      className="w-full"
    >
      <HumansHeader onOpenCreate={handleOpenCreate} />
      <HumansToolbar filters={filters} onChange={setFilters} />
      {isLoading && humans.length === 0 ? (
        <HumansListSkeleton />
      ) : (
        <HumansList
          humans={filtered}
          isLibraryEmpty={humans.length === 0}
          onOpenDetail={handleOpenDetail}
          onDelete={handleOpenDelete}
          onOpenCreate={handleOpenCreate}
        />
      )}

      {isCreateOpen ? (
        <CreateHumanModal onClose={handleCloseCreate} onCreated={handleCreated} />
      ) : null}

      {deletingHuman ? (
        <DeleteHumanDialog
          human={deletingHuman}
          onClose={handleCloseDelete}
          onDeleted={handleDeleted}
        />
      ) : null}
    </main>
  );
}
