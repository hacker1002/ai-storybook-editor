// quiz-option-card.tsx - Individual quiz option card for PlayQuizModal
'use client';

import { useCallback } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadQuizOption, SpreadQuizOptionContent } from '../shared/types';

type OptionState = 'idle' | 'correct' | 'wrong';

interface QuizOptionCardProps {
  option: SpreadQuizOption;
  languageKey: string;
  state: OptionState;
  disabled: boolean;
  onSelect: () => void;
  onPlayAudio: (url: string) => void;
}

export function QuizOptionCard({
  option,
  languageKey,
  state,
  disabled,
  onSelect,
  onPlayAudio,
}: QuizOptionCardProps) {
  const langData = option[languageKey] as SpreadQuizOptionContent | undefined;

  const handleCardClick = useCallback(() => {
    if (disabled) return;
    onSelect();
  }, [disabled, onSelect]);

  const handleAudioClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (langData?.audio_url) {
      onPlayAudio(langData.audio_url);
    }
  }, [langData?.audio_url, onPlayAudio]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }, [disabled, onSelect]);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 select-none',
        state === 'idle' && !disabled && 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer',
        state === 'idle' && disabled && 'border-gray-200 opacity-60 cursor-default',
        state === 'correct' && 'border-green-500 bg-green-50',
        state === 'wrong' && 'border-red-500 bg-red-50',
      )}
    >
      {/* Image */}
      {option.image_url && (
        <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
          <img
            src={option.image_url}
            alt={langData?.text || 'Option'}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      )}

      {/* Text */}
      {langData?.text && (
        <span className="text-sm font-medium text-center leading-snug">
          {langData.text}
        </span>
      )}

      {/* Audio button */}
      {langData?.audio_url && (
        <button
          type="button"
          onClick={handleAudioClick}
          className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
          aria-label="Play option audio"
        >
          <Volume2 className="h-4 w-4 text-gray-500" />
        </button>
      )}

      {/* Feedback icon overlay */}
      {state === 'correct' && (
        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-0.5">
          <Check className="h-3.5 w-3.5" />
        </div>
      )}
      {state === 'wrong' && (
        <div className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-0.5">
          <X className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}
