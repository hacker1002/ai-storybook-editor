// play-quiz-modal.tsx - Interactive quiz modal for player mode
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SpreadQuiz, SpreadQuizContent } from '@/types/spread-types';
import { QuizOptionCard } from './quiz-option-card';
import { useQuizAudio } from './hooks/use-quiz-audio';

type AnswerState = 'idle' | 'correct' | 'wrong';

interface PlayQuizModalProps {
  quiz: SpreadQuiz;
  languageKey: string;
  onClose: (completed: boolean) => void;
}

// Resolve language key: try given key first, then fallback to first available key
function resolveLanguageKey(quiz: SpreadQuiz, preferredKey: string): string {
  const quizContent = quiz[preferredKey] as SpreadQuizContent | undefined;
  if (quizContent?.title) return preferredKey;

  // Fallback: find first key that has a title
  const reserved = new Set(['id', 'geometry', 'z-index', 'player_visible', 'editor_visible', 'options']);
  for (const key of Object.keys(quiz)) {
    if (reserved.has(key)) continue;
    const content = quiz[key] as SpreadQuizContent | undefined;
    if (content?.title) return key;
  }
  return preferredKey;
}

export function PlayQuizModal({ quiz, languageKey, onClose }: PlayQuizModalProps) {
  const resolvedKey = resolveLanguageKey(quiz, languageKey);
  const quizContent = quiz[resolvedKey] as SpreadQuizContent | undefined;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const { playAudio, stopAll, playSfx } = useQuizAudio();

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      stopAll();
    };
  }, [stopAll]);

  const handleOptionSelect = useCallback((index: number) => {
    if (answerState !== 'idle') return;

    const option = quiz.options[index];
    setSelectedIndex(index);

    if (option.is_answer) {
      setAnswerState('correct');
      playSfx('correct');
      completedRef.current = true;
      timeoutRef.current = setTimeout(() => {
        onClose(true);
      }, 1500);
    } else {
      setAnswerState('wrong');
      playSfx('wrong');
      timeoutRef.current = setTimeout(() => {
        setAnswerState('idle');
        setSelectedIndex(null);
      }, 1000);
    }
  }, [answerState, quiz.options, playSfx, onClose]);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    stopAll();
    onClose(completedRef.current);
  }, [onClose, stopAll]);

  const handleTitleAudio = useCallback(() => {
    if (quizContent?.audio_url) {
      playAudio(quizContent.audio_url);
    }
  }, [quizContent?.audio_url, playAudio]);

  // Grid columns based on option count
  const optionCount = quiz.options.length;
  const gridCols = optionCount <= 2 ? 'grid-cols-2' : optionCount === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';

  return (
    <Dialog open onOpenChange={() => handleClose()}>
      <DialogContent
        className="max-w-lg sm:max-w-xl md:max-w-2xl p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={() => handleClose()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base font-semibold">Quiz</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Title section */}
          <div className="flex items-start gap-3">
            <p className="flex-1 text-lg font-medium leading-snug">
              {quizContent?.title || 'Quiz'}
            </p>
            {quizContent?.audio_url && (
              <button
                type="button"
                onClick={handleTitleAudio}
                className="shrink-0 p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Play title audio"
              >
                <Volume2 className="h-5 w-5 text-indigo-500" />
              </button>
            )}
          </div>

          {/* Separator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Chọn đáp án</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Options grid */}
          <div className={cn('grid gap-3', gridCols)}>
            {quiz.options.map((option, index) => {
              let optionState: 'idle' | 'correct' | 'wrong' = 'idle';
              if (selectedIndex === index) {
                optionState = answerState === 'idle' ? 'idle' : answerState;
              }

              return (
                <QuizOptionCard
                  key={index}
                  option={option}
                  languageKey={resolvedKey}
                  state={optionState}
                  disabled={answerState !== 'idle'}
                  onSelect={() => handleOptionSelect(index)}
                  onPlayAudio={playAudio}
                />
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
