// human-detail-page.tsx — Route /humans/:id. Orchestrates header + form + profile sections + modals.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HumanDetailHeader } from '@/features/humans/components/human-detail-header';
import { HumanDetailForm } from '@/features/humans/components/human-detail-form';
import { HumanDetailSkeleton } from '@/features/humans/components/human-detail-skeleton';
import { NotFoundView } from '@/features/humans/components/not-found-view';
import { VisualProfilesSection } from '@/features/humans/components/visual-profiles-section';
import { VoiceProfilesSection } from '@/features/humans/components/voice-profiles-section';
import { AddVisualProfileModal } from '@/features/humans/components/add-visual-profile-modal';
import { AddVoiceProfileModal } from '@/features/humans/components/add-voice-profile-modal';
import { DeleteHumanDialog } from '@/features/humans/components/delete-human-dialog';
import {
  useExtractCooldownClientIds,
  useHumanById,
  useHumansActions,
  useHumansLoading,
  useProcessingClientIds,
} from '@/stores/humans-store';
import type {
  Human,
  HumanMetadataPatch,
  VisualProfile,
  VoiceProfile,
} from '@/types/human';
import { createLogger } from '@/utils/logger';

const log = createLogger('Humans', 'HumanDetailPage');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActiveModal = 'add-visual' | 'add-voice' | null;

export function HumanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const validId = id && UUID_RE.test(id) ? id : null;

  const human = useHumanById(validId ?? undefined);
  const isLoading = useHumansLoading();
  const processingClientIds = useProcessingClientIds();
  const extractCooldownClientIds = useExtractCooldownClientIds();
  const {
    fetchHumanById,
    updateHumanMetadata,
    addVisualProfile,
    updateVisualProfile,
    removeVisualProfile,
    runProfilePipeline,
    addVoiceProfile,
    updateVoiceProfile,
    removeVoiceProfile,
  } = useHumansActions();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [deletingHuman, setDeletingHuman] = useState<Human | null>(null);
  const [fetchSettled, setFetchSettled] = useState(false);
  const fetchTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!validId) return;
    if (human) return;
    if (fetchTokenRef.current === validId) return;
    log.info('mount', 'fetching human', { id: validId });
    fetchTokenRef.current = validId;
    void fetchHumanById(validId).finally(() => setFetchSettled(true));
  }, [validId, human, fetchHumanById]);

  const handleBack = useCallback(() => navigate('/humans'), [navigate]);

  const handleMetadataChange = useCallback(
    async (patch: HumanMetadataPatch) => {
      if (!validId) return;
      log.debug('handleMetadataChange', 'patch', { fields: Object.keys(patch) });
      const result = await updateHumanMetadata(validId, patch);
      if (!result) toast.error('Failed to save changes');
    },
    [validId, updateHumanMetadata],
  );

  const handleVisualUpdate = useCallback(
    async (index: number, patch: Partial<Pick<VisualProfile, 'name'>>) => {
      if (!validId) return;
      const result = await updateVisualProfile(validId, index, patch);
      if (!result) toast.error('Failed to update visual profile');
    },
    [validId, updateVisualProfile],
  );

  const handleVisualRemove = useCallback(
    async (index: number) => {
      if (!validId) return;
      const result = await removeVisualProfile(validId, index);
      if (!result) toast.error('Failed to remove visual profile');
    },
    [validId, removeVisualProfile],
  );

  const handleExtractTraits = useCallback(
    (index: number) => {
      if (!human) return;
      const profile = human.visualProfiles[index];
      if (!profile) return;
      void runProfilePipeline(human.id, profile.clientId);
    },
    [human, runProfilePipeline],
  );

  const handleVoiceUpdate = useCallback(
    async (index: number, patch: Partial<Pick<VoiceProfile, 'name' | 'age'>>) => {
      if (!validId) return;
      const result = await updateVoiceProfile(validId, index, patch);
      if (!result) toast.error('Failed to update voice profile');
    },
    [validId, updateVoiceProfile],
  );

  const handleVoiceRemove = useCallback(
    async (index: number) => {
      if (!validId) return;
      const result = await removeVoiceProfile(validId, index);
      if (!result) toast.error('Failed to remove voice profile');
    },
    [validId, removeVoiceProfile],
  );

  const handleAddVisual = useCallback(
    async (profile: VisualProfile) => {
      if (!validId) throw new Error('Missing human id');
      const result = await addVisualProfile(validId, profile);
      if (!result) throw new Error('Failed to add visual profile');
    },
    [validId, addVisualProfile],
  );

  const handleAddVoice = useCallback(
    async (profile: VoiceProfile) => {
      if (!validId) throw new Error('Missing human id');
      const result = await addVoiceProfile(validId, profile);
      if (!result) throw new Error('Failed to add voice profile');
    },
    [validId, addVoiceProfile],
  );

  const handleDeleted = useCallback(() => {
    log.info('handleDeleted', 'navigating back to list');
    navigate('/humans');
    toast.success('Human deleted');
  }, [navigate]);

  if (!validId) {
    return <NotFoundView resource="human" onBack={handleBack} />;
  }

  if (!human) {
    if (isLoading || !fetchSettled) return <HumanDetailSkeleton />;
    return <NotFoundView resource="human" onBack={handleBack} />;
  }

  return (
    <main
      aria-labelledby="human-detail-heading"
      className="w-full pb-12"
    >
      <HumanDetailHeader
        human={human}
        onBack={handleBack}
        onDelete={() => setDeletingHuman(human)}
      />
      <div className="max-w-4xl">
        <HumanDetailForm human={human} onChange={handleMetadataChange} />
      </div>

      <VisualProfilesSection
        profiles={human.visualProfiles}
        processingClientIds={processingClientIds}
        extractCooldownClientIds={extractCooldownClientIds}
        onAdd={() => setActiveModal('add-visual')}
        onUpdate={handleVisualUpdate}
        onRemove={handleVisualRemove}
        onExtractTraits={handleExtractTraits}
      />

      <VoiceProfilesSection
        profiles={human.voiceProfiles}
        onAdd={() => setActiveModal('add-voice')}
        onUpdate={handleVoiceUpdate}
        onRemove={handleVoiceRemove}
      />

      {activeModal === 'add-visual' ? (
        <AddVisualProfileModal
          humanId={validId}
          defaultName={`Visual Profile ${human.visualProfiles.length + 1}`}
          onClose={() => setActiveModal(null)}
          onAdded={async (profile) => {
            await handleAddVisual(profile);
          }}
        />
      ) : null}

      {activeModal === 'add-voice' ? (
        <AddVoiceProfileModal
          humanId={validId}
          defaultName={`Voice ${human.voiceProfiles.length + 1}`}
          onClose={() => setActiveModal(null)}
          onAdded={async (profile) => {
            await handleAddVoice(profile);
          }}
        />
      ) : null}

      {deletingHuman ? (
        <DeleteHumanDialog
          human={deletingHuman}
          onClose={() => setDeletingHuman(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </main>
  );
}
