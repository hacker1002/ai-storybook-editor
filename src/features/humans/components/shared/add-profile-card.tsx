// add-profile-card.tsx — Dashed-border placeholder card for adding a new profile.

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/utils';

interface AddProfileCardProps {
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  onClick: () => void;
}

export function AddProfileCard({ label, sublabel, icon: Icon, onClick }: AddProfileCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex aspect-square w-[280px] flex-col items-center justify-center gap-2 self-start rounded-lg border-2 border-dashed border-border bg-card p-4 text-center',
        'transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium">{label}</span>
      {sublabel ? (
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      ) : null}
    </button>
  );
}
