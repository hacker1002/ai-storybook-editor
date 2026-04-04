// branch-path-modal.tsx - Branch path selection modal for interactive player mode
'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Volume2, ImageIcon, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { cn } from '@/utils/utils';
import type { BranchSetting, Branch, Section, BranchLocalizedContent } from '@/types/illustration-types';
import { useNarrationLanguage } from '@/stores/animation-playback-store';
import { useBookBranchTypography } from '@/stores/book-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'BranchPathModal');

interface BranchPathModalProps {
  branchSetting: BranchSetting;
  sections: Section[];
  onSelect: (targetSpreadId: string, section: Section) => void;
  onDismiss: () => void;
}

interface BranchOptionCardProps {
  branch: Branch;
  languageCode: string;
  typographyStyle: CSSProperties;
  onClick: () => void;
}

function BranchOptionCard({ branch, languageCode, typographyStyle, onClick }: BranchOptionCardProps) {
  const content = branch[languageCode] as BranchLocalizedContent | undefined;
  const title = content?.title ?? '';
  const imageUrl = branch.image_url ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-[120px] max-w-[200px] shrink-0 rounded-xl cursor-pointer hover:shadow-xl hover:-translate-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
    >
      <div className="aspect-square overflow-hidden rounded-xl bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-contain" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="pt-2 pb-1 truncate text-center" style={typographyStyle}>{title}</div>
    </button>
  );
}

export function BranchPathModal({ branchSetting, sections, onSelect, onDismiss }: BranchPathModalProps) {
  const narrationLanguage = useNarrationLanguage();
  const branchTypo = useBookBranchTypography(narrationLanguage);
  const typographyStyle: CSSProperties = {
    fontFamily: branchTypo.family,
    fontSize: branchTypo.size,
    color: branchTypo.color,
    lineHeight: 1.4,
  };
  const langData = branchSetting[narrationLanguage] as BranchLocalizedContent | undefined;
  const titleText = langData?.title ?? '';
  const audioUrl = langData?.audio_url ?? null;

  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play title audio on mount; pause on unmount to avoid leak
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.onplay = () => setIsAudioPlaying(true);
    audio.onended = () => setIsAudioPlaying(false);
    audioRef.current = audio;
    audio.play().catch((err) => {
      log.warn('autoplay', 'play rejected by browser', { err: String(err) });
    });
    return () => {
      audioRef.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReplayAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
    setIsAudioPlaying(true);
  };

  const handleOptionSelect = (branch: Branch) => {
    const section = sections.find((s) => s.id === branch.section_id);
    if (section) {
      log.info('handleOptionSelect', 'branch selected', { sectionId: section.id, spreadId: section.start_spread_id });
      onSelect(section.start_spread_id, section);
    } else {
      log.warn('handleOptionSelect', 'section not found, dismissing', { sectionId: branch.section_id });
      onDismiss();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-[640px] min-h-[28rem] translate-x-[-50%] translate-y-[-50%]',
            'border bg-background p-6 shadow-lg rounded-lg flex flex-col',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Visually hidden title for screen reader accessibility */}
          <DialogPrimitive.Title className="sr-only">Chọn nhánh câu chuyện</DialogPrimitive.Title>

          {/* Close button */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Đóng"
            className="absolute right-3 top-3 p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Header: replay button + title */}
          {(audioUrl || titleText) && (
            <div className="flex items-center justify-center gap-3 mb-6">
              {audioUrl && (
                <button
                  type="button"
                  onClick={handleReplayAudio}
                  aria-label="Nghe lại câu hỏi"
                  aria-pressed={isAudioPlaying}
                  className="shrink-0 p-2 rounded-full hover:bg-muted transition-colors"
                >
                  <Volume2 className={cn('h-5 w-5 text-indigo-500', isAudioPlaying && 'animate-pulse')} />
                </button>
              )}
              {titleText && <p style={typographyStyle}>{titleText}</p>}
            </div>
          )}

          {/* Branch option cards — horizontal scroll when many branches */}
          <div className="flex flex-row gap-6 overflow-x-auto py-2 flex-1 items-center justify-evenly">
            {branchSetting.branches.map((branch, index) => (
              <BranchOptionCard
                key={index}
                branch={branch}
                languageCode={narrationLanguage}
                typographyStyle={typographyStyle}
                onClick={() => handleOptionSelect(branch)}
              />
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
