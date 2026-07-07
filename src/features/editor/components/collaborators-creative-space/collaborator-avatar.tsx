// CollaboratorAvatar — avatar with initials fallback. Reused by the sidebar row
// and the add-collaborator modal row (create-once-use-twice). Degrades gracefully
// when the profile (name/avatar) is missing — the candidate-users gateway may have
// failed, so `name`/`avatarUrl` can both be undefined → renders a "?" fallback.

import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/utils/utils';

interface CollaboratorAvatarProps {
  name?: string;
  avatarUrl?: string | null;
  className?: string;
}

/** Up-to-2-letter initials from a display name; "?" when unknown. */
function initialsOf(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CollaboratorAvatar({ name, avatarUrl, className }: CollaboratorAvatarProps) {
  // This Avatar is a plain <img>/<span> (not Radix), so it has no built-in
  // load-error fallback. Track the failing URL (not a boolean) so a later prop change
  // to a fresh URL re-attempts the image without a stale "failed" flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!avatarUrl && avatarUrl !== failedUrl;

  return (
    <Avatar className={cn('h-8 w-8', className)}>
      {showImage ? (
        <AvatarImage src={avatarUrl} alt={name ?? ''} onError={() => setFailedUrl(avatarUrl)} />
      ) : (
        <AvatarFallback className="text-xs">{initialsOf(name)}</AvatarFallback>
      )}
    </Avatar>
  );
}
