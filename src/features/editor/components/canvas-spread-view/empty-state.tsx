// empty-state.tsx - Chrome for CanvasSpreadView empty state (no spreads)
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/utils';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-full w-full flex-col items-center justify-center p-8 text-center',
        className,
      )}
    >
      <div aria-hidden="true" className="mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-medium">{title}</h3>
      {description && (
        <p className="mb-4 max-w-md text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
