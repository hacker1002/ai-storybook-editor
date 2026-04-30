// first-gesture-gate.tsx - Full-screen overlay capturing first user gesture
// before PlayerCanvas mounts. Required to unlock browser autoplay policy
// (auto_audios BGM, narration, sound effects, read-along).
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'FirstGestureGate');

interface FirstGestureGateProps {
  onCapture: () => void;
}

export function FirstGestureGate({ onCapture }: FirstGestureGateProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.info('mount', 'gate shown awaiting user gesture');
    buttonRef.current?.focus();
  }, []);

  const handleCapture = useCallback(
    (source: 'click' | 'keyboard') => {
      // Belt-and-suspenders: trigger a muted play() bound directly to the gesture
      // so browser registers transient activation even if React commit is delayed.
      try {
        const primer = new Audio();
        primer.muted = true;
        const p = primer.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => {
            log.debug('primer', 'silent primer play rejected (benign)');
          });
        }
      } catch (err) {
        log.debug('primer', 'silent primer init failed (benign)', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      log.info('handleCapture', 'gesture captured', { source });
      onCapture();
    },
    [onCapture],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      ref={buttonRef}
      aria-label="Bấm để bắt đầu phát"
      onClick={() => handleCapture('click')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCapture('keyboard');
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px] cursor-pointer outline-none"
    >
      <div className="flex items-center justify-center w-24 h-24 rounded-full bg-white/15 ring-1 ring-white/25 pointer-events-none select-none">
        <Play className="h-12 w-12 text-white/80 fill-white/80 ml-1" />
      </div>
    </div>
  );
}

export default FirstGestureGate;
