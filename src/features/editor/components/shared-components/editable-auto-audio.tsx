// editable-auto-audio.tsx - Auto-audio item: editor icon (no playback) + player hidden looping <audio> (imperative play() on mount, data-auto-audio sentinel)
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadAutoAudio } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';
import {
  useContextCreated,
  usePlayerAudioActions,
} from '@/stores/player-audio-store';

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
  const actions = usePlayerAudioActions();
  const contextCreated = useContextCreated();

  // Route playback through playerAudioStore so the audio queues while the
  // AudioContext is suspended (pre-gesture) and flushes only after the
  // FirstGestureGate's resumeContext call. Calling el.play() directly here
  // would bypass the gate via transient user activation from the "enter
  // preview" click. src lives on the JSX prop (React-owned); cleanup uses
  // cancelPlay so we never mutate el.src (Strict-Mode double-mount safety).
  useEffect(() => {
    if (isEditable) return;
    const el = audioRef.current;
    if (!el || !autoAudio.media_url || !contextCreated) return;

    actions.attachAudio(el);
    actions.requestPlay(el);

    return () => {
      actions.cancelPlay(el);
    };
  }, [isEditable, autoAudio.id, autoAudio.media_url, contextCreated, actions]);

  const handleAudioError = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      log.error('auto_audio_load_error', 'Audio element error', {
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
        crossOrigin="anonymous"
        data-audio-channel="sfx"
        aria-hidden="true"
        data-auto-audio="true"
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
