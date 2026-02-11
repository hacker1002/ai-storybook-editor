import { useState } from 'react';
import { Menu, ChevronRight, Bell, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentStep } from '@/stores/editor-settings-store';
import { PIPELINE_STEPS } from '@/constants/editor-constants';
import { MenuPopover } from './menu-popover';
import { LanguageSelector } from './language-selector';
import type { PipelineStep, SaveStatus, Language, UserPoints, EditorMode } from '@/types/editor';
import { cn } from '@/lib/utils';

interface EditorHeaderProps {
  bookTitle: string;
  saveStatus: SaveStatus;
  notificationCount: number;
  userPoints: UserPoints;
  editorMode: EditorMode;
  onTitleEdit: (newTitle: string) => void;
  onSave: () => Promise<void>;
  onNotificationClick: () => void;
  onNavigateHome: () => void;
  onStepChange: (targetStep: PipelineStep) => void;
  onLanguageChange: (newLang: Language, prevLang: Language) => void;
}

export function EditorHeader({
  bookTitle,
  saveStatus,
  notificationCount,
  userPoints,
  editorMode,
  onTitleEdit,
  onSave,
  onNotificationClick,
  onNavigateHome,
  onStepChange,
  onLanguageChange,
}: EditorHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(bookTitle);
  const currentStep = useCurrentStep();

  const handleTitleClick = () => {
    setEditTitleValue(bookTitle);
    setIsEditingTitle(true);
  };

  const handleTitleSubmit = () => {
    if (editTitleValue.trim() && editTitleValue !== bookTitle) {
      onTitleEdit(editTitleValue.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSubmit();
    if (e.key === 'Escape') setIsEditingTitle(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        <MenuPopover
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          userPoints={userPoints}
          editorMode={editorMode}
          onNavigateHome={onNavigateHome}
        >
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </MenuPopover>

        {/* Book Title */}
        {isEditingTitle ? (
          <Input
            value={editTitleValue}
            onChange={(e) => setEditTitleValue(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleTitleKeyDown}
            className="h-8 w-48"
            autoFocus
          />
        ) : (
          <button
            onClick={handleTitleClick}
            className="max-w-[200px] truncate text-sm font-medium hover:text-primary"
          >
            {bookTitle}
          </button>
        )}
      </div>

      {/* Center Section - Step Breadcrumb */}
      <nav className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, index) => (
          <div key={step.key} className="flex items-center">
            {index > 0 && <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground" />}
            {step.key === currentStep ? (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {step.label}
              </span>
            ) : (
              <button
                onClick={() => onStepChange(step.key)}
                className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {step.label}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Save Status */}
        <SaveStatusIndicator status={saveStatus} onSave={onSave} />

        {/* Language Selector */}
        <LanguageSelector onLanguageChange={onLanguageChange} />

        {/* Notifications */}
        <Button variant="ghost" size="icon" onClick={onNotificationClick} className="relative">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

function SaveStatusIndicator({ status, onSave }: { status: SaveStatus; onSave: () => void }) {
  const config = {
    saved: { icon: Check, text: 'Saved', className: 'text-green-600' },
    unsaved: { icon: AlertCircle, text: 'Unsaved', className: 'text-yellow-600' },
    saving: { icon: Loader2, text: 'Saving...', className: 'text-muted-foreground' },
  };

  const { icon: Icon, text, className } = config[status];

  return (
    <button
      onClick={status === 'unsaved' ? onSave : undefined}
      disabled={status !== 'unsaved'}
      className={cn(
        'flex items-center gap-1 text-sm',
        className,
        status === 'unsaved' && 'cursor-pointer hover:underline'
      )}
    >
      <Icon className={cn('h-4 w-4', status === 'saving' && 'animate-spin')} />
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}
