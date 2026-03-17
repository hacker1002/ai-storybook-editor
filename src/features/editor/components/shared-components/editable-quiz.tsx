// editable-quiz.tsx - Quiz icon component for canvas display (editor + player)
'use client';

import { useState, useCallback } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { SpreadQuiz } from '@/types/spread-types';
import { COLORS } from '@/constants/spread-constants';

interface EditableQuizProps {
  quiz: SpreadQuiz;
  index: number;
  zIndex?: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: () => void;
}

export function EditableQuiz({
  quiz,
  index,
  zIndex,
  isSelected,
  isEditable,
  onSelect,
}: EditableQuizProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable) {
      onSelect();
    }
  }, [isEditable, onSelect]);

  return (
    <div
      role="img"
      aria-label={`Quiz ${index + 1}`}
      tabIndex={isEditable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && isEditable && onSelect()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'absolute',
        isEditable && 'cursor-pointer',
        !isSelected && isHovered && 'outline-dashed outline-1',
      )}
      style={{
        left: `${quiz.geometry.x}%`,
        top: `${quiz.geometry.y}%`,
        zIndex,
        outlineColor: COLORS.HOVER_OUTLINE,
      }}
    >
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full border-2',
          isSelected ? 'border-solid' : 'border-dashed',
        )}
        style={{
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderColor: isSelected ? COLORS.SELECTION : 'rgb(99, 102, 241)',
        }}
      >
        <CircleHelp className="h-4 w-4 text-indigo-500" />
      </div>
    </div>
  );
}
