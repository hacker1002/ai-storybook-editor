// story-branching-modal.tsx - Modal for configuring story branching on a spread

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranchSetting, useSections, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useLanguageCode } from '@/stores/editor-settings-store';
import { uploadImageToStorage } from '@/apis/storage-api';
import { createLogger } from '@/utils/logger';
import { BranchCard } from './branch-card';
import { AddBranchCard } from './add-branch-card';
import type { DraftBranch, BranchLocalizedContent } from './branch-types';

const log = createLogger('Editor', 'StoryBranchingModal');

interface StoryBranchingModalProps {
  spreadId: string;
  onClose: () => void;
}

function buildInitialDrafts(
  branchSetting: ReturnType<typeof useBranchSetting>,
  langCode: string,
): DraftBranch[] {
  if (!branchSetting || branchSetting.branches.length === 0) {
    return [{ id: crypto.randomUUID(), sectionId: '', title: '', imageUrl: undefined }];
  }
  return branchSetting.branches.map((branch) => ({
    id: crypto.randomUUID(),
    sectionId: branch.section_id,
    imageUrl: branch.image_url,
    title: (branch[langCode] as BranchLocalizedContent | undefined)?.title ?? '',
  }));
}

export function StoryBranchingModal({ spreadId, onClose }: StoryBranchingModalProps) {
  const branchSetting = useBranchSetting(spreadId);
  const sections = useSections();
  const { setBranchSetting } = useSnapshotActions();
  const langCode = useLanguageCode();

  const [draftBranches, setDraftBranches] = useState<DraftBranch[]>(() =>
    buildInitialDrafts(branchSetting, langCode)
  );
  const [defaultBranchIndex, setDefaultBranchIndex] = useState(0);
  const [uploadingIndices, setUploadingIndices] = useState<Set<number>>(new Set());
  const [promptTitle, setPromptTitle] = useState(
    () => (branchSetting?.[langCode] as BranchLocalizedContent | undefined)?.title ?? '',
  );

  log.info('render', 'modal open', { spreadId, branchCount: draftBranches.length });

  function handleAddBranch() {
    log.info('handleAddBranch', 'adding branch', { newIndex: draftBranches.length });
    setDraftBranches((prev) => [...prev, { id: crypto.randomUUID(), sectionId: '', title: '', imageUrl: undefined }]);
  }

  function handleDeleteBranch(index: number) {
    log.info('handleDeleteBranch', 'deleting branch', { index });
    setDraftBranches((prev) => prev.filter((_, i) => i !== index));
    setDefaultBranchIndex((prev) => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  }

  function handleUpdateBranch(index: number, updates: Partial<DraftBranch>) {
    log.debug('handleUpdateBranch', 'updating branch', { index, updates });
    setDraftBranches((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...updates } : b))
    );
  }

  async function handleImageUpload(index: number, file: File) {
    log.info('handleImageUpload', 'uploading image', { index, fileName: file.name });
    setUploadingIndices((prev) => new Set([...prev, index]));
    try {
      const result = await uploadImageToStorage(file, 'branch-images');
      log.info('handleImageUpload', 'upload complete', { index, publicUrl: result.publicUrl });
      handleUpdateBranch(index, { imageUrl: result.publicUrl });
    } catch (err) {
      log.error('handleImageUpload', 'upload failed', { index, error: String(err) });
      toast.error('Upload ảnh thất bại. Vui lòng thử lại.');
    } finally {
      setUploadingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  function handleSave() {
    log.info('handleSave', 'saving branch setting', { spreadId, branchCount: draftBranches.length, defaultIndex: defaultBranchIndex });

    // Reorder so default branch is at index 0 (convention: first branch = default)
    const ordered = [...draftBranches];
    if (defaultBranchIndex > 0 && defaultBranchIndex < ordered.length) {
      const [defaultBranch] = ordered.splice(defaultBranchIndex, 1);
      ordered.unshift(defaultBranch);
    }

    const payload = {
      branches: ordered.map((d) => ({
        section_id: d.sectionId,
        image_url: d.imageUrl,
        [langCode]: { title: d.title } as BranchLocalizedContent,
      })),
      [langCode]: { title: promptTitle.trim() } as BranchLocalizedContent,
    };

    setBranchSetting(spreadId, payload);
    onClose();
  }

  const canSave = draftBranches.every((b) => b.title.trim() && b.sectionId);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cấu hình nhánh câu chuyện</DialogTitle>
        </DialogHeader>

        {/* Narration prompt — read aloud when branching modal appears */}
        <div className="flex flex-col gap-1 px-1">
          <label className="text-xs font-medium text-muted-foreground">Câu dẫn truyện</label>
          <Input
            value={promptTitle}
            onChange={(e) => setPromptTitle(e.target.value)}
            placeholder="VD: Bạn muốn đi đâu tiếp theo?"
            className="text-sm"
          />
        </div>

        {/* Horizontal scrollable branch list */}
        <div className="flex gap-4 overflow-x-auto p-4">
          {draftBranches.map((branch, index) => (
            <BranchCard
              key={branch.id}
              index={index}
              branch={branch}
              isDefault={index === defaultBranchIndex}
              canDelete={draftBranches.length > 1}
              sections={sections}
              onSetDefault={() => setDefaultBranchIndex(index)}
              onDelete={() => handleDeleteBranch(index)}
              onUpdate={(updates) => handleUpdateBranch(index, updates)}
              isUploading={uploadingIndices.has(index)}
              onImageUpload={(file) => handleImageUpload(index, file)}
            />
          ))}
          <AddBranchCard onClick={handleAddBranch} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
