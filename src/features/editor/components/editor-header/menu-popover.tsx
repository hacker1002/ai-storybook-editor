import { ArrowLeft, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { UserPoints, EditorMode } from '@/types/editor';

interface MenuPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userPoints: UserPoints;
  editorMode: EditorMode;
  onNavigateHome: () => void;
  children: React.ReactNode;
}

export function MenuPopover({
  isOpen,
  onOpenChange,
  userPoints,
  editorMode,
  onNavigateHome,
  children,
}: MenuPopoverProps) {
  const progressPercent = (userPoints.current / userPoints.total) * 100;

  const handleHomeClick = () => {
    onNavigateHome();
    onOpenChange(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {/* Points Section */}
        <div className="p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <span>✨</span> Points
            </span>
            <span className="text-muted-foreground">
              {userPoints.current} / {userPoints.total}
            </span>
          </div>
          <Progress value={progressPercent} className="mt-2" />
        </div>

        <Separator />

        {/* Home Navigation */}
        <button
          onClick={handleHomeClick}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>

        <Separator />

        {/* Editor Mode (display only) */}
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
          <Settings className="h-4 w-4" />
          Editor Mode: {editorMode === 'book' ? 'Book' : 'Asset'}
        </div>
      </PopoverContent>
    </Popover>
  );
}
