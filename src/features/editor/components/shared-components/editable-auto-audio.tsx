// editable-auto-audio.tsx - Auto-audio item: editor icon (no playback) + player hidden <audio autoPlay loop>
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadAutoAudio } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditableAutoAudio');

interface EditableAutoAudioProps {
  autoAudio: SpreadAutoAudio;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  isThumbnail?: boolean;
  onSelect: () => void;
}

export function EditableAutoAudio({
  autoAudio,
  index,
  zIndex,
  isSelected,
  isEditable,
  isThumbnail,
  onSelect,
}: EditableAutoAudioProps) {
  // ─────────────────────── PLAYER MODE branch ───────────────────────
  // Component owns playback lifecycle; React unmount on spread change → cleanup useEffect releases MediaSource.
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isEditable) return;
    const a = audioRef.current;
    if (!a) return;

    a.play().catch((err: unknown) => {
      const errorName = err instanceof Error ? err.name : 'Unknown';
      log.warn('autoplay', 'Browser blocked autoplay', {
        autoAudioId: autoAudio.id,
        mediaUrl: autoAudio.media_url,
        errorName,
      });
    });

    return () => {
      try {
        a.pause();
        a.removeAttribute('src');
        a.load();
      } catch (err) {
        log.debug('cleanup', 'audio cleanup failed (benign)', {
          autoAudioId: autoAudio.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    };
  }, [isEditable, autoAudio.id, autoAudio.media_url]);

  const handleAudioError = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      log.error('mediaLoad', 'Audio element error', {
        autoAudioId: autoAudio.id,
        mediaUrl: autoAudio.media_url,
        errorCode: e.currentTarget.error?.code,
      });
    },
    [autoAudio.id, autoAudio.media_url]
  );

  // ─────────────────────── EDITOR MODE branch ───────────────────────
  // Hooks below MUST run unconditionally (rules of hooks). Branch via render output below.
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEditable && !isThumbnail) {
        onSelect();
      }
    },
    [isEditable, isThumbnail, onSelect]
  );

  // Player render
  if (!isEditable) {
    if (!autoAudio.media_url) return null;
    return (
      <audio
        ref={audioRef}
        src={autoAudio.media_url}
        loop
        aria-hidden="true"
        onError={handleAudioError}
      />
    );
  }

  // Editor render
  if (!autoAudio.editor_visible) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={autoAudio.title || autoAudio.name || `Auto-audio ${index + 1}`}
      tabIndex={isThumbnail ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isThumbnail && isEditable) onSelect();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute flex items-center justify-center',
        !isThumbnail && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1'
      )}
      style={{
        left: `${autoAudio.geometry.x}%`,
        top: `${autoAudio.geometry.y}%`,
        zIndex,
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full border-2',
          isSelected ? 'border-solid' : 'border-dashed'
        )}
        style={{
          // Soft purple/indigo bg — visually distinct from audio icon (PLACEHOLDER_BG gray).
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          borderColor: isSelected ? COLORS.SELECTION : COLORS.PLACEHOLDER_BORDER,
        }}
      >
        <Music className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default EditableAutoAudio;
