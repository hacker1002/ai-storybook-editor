// story-branching-modal.tsx - Modal for configuring story branching on a spread

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Sparkles, Play, Pause, Loader2 } from 'lucide-react';
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
import { callGenerateNarration } from '@/apis/retouch-api';
import { createLogger } from '@/utils/logger';
import { BranchCard } from './branch-card';
import { AddBranchCard } from './add-branch-card';
import type { DraftBranch, BranchLocalizedContent } from './branch-types';

const log = createLogger('Editor', 'StoryBranchingModal');

// Map language code prefix to default voice
function getDefaultVoiceId(langCode: string): string {
  const prefix = langCode.split('_')[0]; // 'vi_VN' → 'vi', 'en_US' → 'en'
  const voiceMap: Record<string, string> = {
    vi: 'vi-female-1',
    en: 'en-female-1',
    ja: 'vi-female-1', // fallback
    ko: 'vi-female-1',
    zh: 'vi-female-1',
  };
  return voiceMap[prefix] ?? 'vi-female-1';
}

interface StoryBranchingModalProps {
  spreadId: string;
  onClose: () => void;
}

function buildInitialDrafts(
  branchSetting: ReturnType<typeof useBranchSetting>,
  langCode: string,
): DraftBranch[] {
  if (!branchSetting || branchSetting.branches.length === 0) {
    return [{ id: crypto.randomUUID(), sectionId: '', title: '', imageUrl: undefined, isDefault: true }];
  }
  return branchSetting.branches.map((branch) => ({
    id: crypto.randomUUID(),
    sectionId: branch.section_id,
    imageUrl: branch.image_url,
    title: (branch[langCode] as BranchLocalizedContent | undefined)?.title ?? '',
    isDefault: branch.is_default,
    _originalBranch: branch,
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
  const [uploadingIndices, setUploadingIndices] = useState<Set<number>>(new Set());
  const [promptTitle, setPromptTitle] = useState(
    () => (branchSetting?.[langCode] as BranchLocalizedContent | undefined)?.title ?? '',
  );

  // Narration state
  const [narrationAudioUrl, setNarrationAudioUrl] = useState<string | null>(
    () => (branchSetting?.[langCode] as BranchLocalizedContent | undefined)?.audio_url ?? null,
  );
  const [isGeneratingNarration, setIsGeneratingNarration] = useState(false);
  const [isPlayingNarration, setIsPlayingNarration] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  log.info('render', 'modal open', { spreadId, branchCount: draftBranches.length });

  function handleAddBranch() {
    log.info('handleAddBranch', 'adding branch', { newIndex: draftBranches.length });
    setDraftBranches((prev) => [...prev, { id: crypto.randomUUID(), sectionId: '', title: '', imageUrl: undefined, isDefault: false }]);
  }

  function handleDeleteBranch(index: number) {
    log.info('handleDeleteBranch', 'deleting branch', { index });
    setDraftBranches((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (prev[index]?.isDefault && next.length > 0) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  }

  function handleUpdateBranch(index: number, updates: Partial<DraftBranch>) {
    log.debug('handleUpdateBranch', 'updating branch', { index, updates });
    setDraftBranches((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...updates } : b))
    );
  }

  function handleSetDefault(targetIndex: number) {
    setDraftBranches((prev) =>
      prev.map((b, i) => ({
        ...b,
        isDefault: i === targetIndex ? !b.isDefault : false,
      }))
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

  async function handleGenerateNarration() {
    if (!promptTitle.trim() || isGeneratingNarration) return;
    const voiceId = getDefaultVoiceId(langCode);
    log.info('handleGenerateNarration', 'start', { voiceId, scriptLength: promptTitle.length });
    setIsGeneratingNarration(true);

    try {
      const response = await callGenerateNarration({
        script: promptTitle,
        voiceId,
        speed: 1,
        emotion: 'neutral',
      });

      if (!response.success || !response.data) {
        toast.error(response.error ?? 'Sinh narration thất bại');
        log.error('handleGenerateNarration', 'API error', { error: response.error });
        return;
      }

      setNarrationAudioUrl(response.data.audioUrl);
      setAudioDuration(null); // will be set by onLoadedMetadata
      log.info('handleGenerateNarration', 'success', { audioUrl: response.data.audioUrl });
      toast.success('Đã sinh narration');

      // Auto-play
      if (audioRef.current) {
        audioRef.current.src = response.data.audioUrl;
        audioRef.current.play().catch(() => setIsPlayingNarration(false));
        setIsPlayingNarration(true);
      }
    } catch (err) {
      toast.error('Sinh narration thất bại');
      log.error('handleGenerateNarration', 'failed', { error: String(err) });
    } finally {
      setIsGeneratingNarration(false);
    }
  }

  function handleTogglePlayNarration() {
    if (!audioRef.current || !narrationAudioUrl) return;

    if (isPlayingNarration) {
      audioRef.current.pause();
      setIsPlayingNarration(false);
    } else {
      audioRef.current.src = narrationAudioUrl;
      audioRef.current.play().catch(() => setIsPlayingNarration(false));
      setIsPlayingNarration(true);
    }
  }

  function handleSave() {
    log.info('handleSave', 'saving branch setting', { spreadId, branchCount: draftBranches.length });

    // Merge with existing locale data to preserve other languages
    const existingLocales: Record<string, BranchLocalizedContent> = {};
    if (branchSetting) {
      for (const key of Object.keys(branchSetting)) {
        if (key !== 'branches' && key !== langCode) {
          const val = branchSetting[key];
          if (val && typeof val === 'object' && 'title' in val) {
            existingLocales[key] = val as BranchLocalizedContent;
          }
        }
      }
    }

    const payload = {
      ...existingLocales,
      branches: draftBranches.map((d) => {
        // Preserve locale entries from original branch, only update current langCode
        const preserved: Record<string, BranchLocalizedContent> = {};
        if (d._originalBranch) {
          for (const key of Object.keys(d._originalBranch)) {
            if (key !== 'section_id' && key !== 'is_default' && key !== 'image_url' && key !== langCode) {
              const val = d._originalBranch[key];
              if (val && typeof val === 'object' && 'title' in val) {
                preserved[key] = val as BranchLocalizedContent;
              }
            }
          }
        }
        return {
          ...preserved,
          section_id: d.sectionId,
          is_default: d.isDefault,
          image_url: d.imageUrl,
          [langCode]: { title: d.title } as BranchLocalizedContent,
        };
      }),
      [langCode]: {
        title: promptTitle.trim(),
        audio_url: narrationAudioUrl ?? undefined,
      } as BranchLocalizedContent,
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

        {/* Narration prompt with generate + play controls */}
        <div className="flex flex-col gap-1 px-1">
          <label className="text-xs font-medium text-muted-foreground">Câu dẫn truyện</label>
          <div className="flex items-center gap-2">
            <Input
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              placeholder="VD: Bạn muốn đi đâu tiếp theo?"
              className="text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={!promptTitle.trim() || isGeneratingNarration}
              onClick={handleGenerateNarration}
              title="Sinh narration"
            >
              {isGeneratingNarration ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </div>
          {narrationAudioUrl && (
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleTogglePlayNarration}
              >
                {isPlayingNarration ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isPlayingNarration ? 'Dừng' : 'Phát narration'}
              </Button>
              {audioDuration != null && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          className="hidden"
          onEnded={() => setIsPlayingNarration(false)}
          onLoadedMetadata={() => {
            if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
              setAudioDuration(audioRef.current.duration);
            }
          }}
        />

        {/* Horizontal scrollable branch list */}
        <div className="flex gap-4 overflow-x-auto p-4">
          {draftBranches.map((branch, index) => (
            <BranchCard
              key={branch.id}
              index={index}
              branch={branch}
              isDefault={branch.isDefault}
              canDelete={draftBranches.length > 1}
              sections={sections}
              onSetDefault={() => handleSetDefault(index)}
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
