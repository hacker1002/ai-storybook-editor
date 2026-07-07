// require-admin.tsx — Route guard for the admin-only Users page. UX layer only;
// the FastAPI /api/users endpoints enforce admin server-side (authoritative).

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentProfile } from '@/features/users/hooks/use-current-profile';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'RequireAdmin');

interface RequireAdminProps {
  children: ReactNode;
}

export function RequireAdmin({ children }: RequireAdminProps) {
  const { role, isLoading } = useCurrentProfile();

  if (isLoading) {
    log.debug('render', 'resolving role');
    return (
      <div className="flex h-full items-center justify-center py-24">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    log.warn('render', 'non-admin blocked; redirecting to /', { role });
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
