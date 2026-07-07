// users-list-skeleton.tsx — Loading placeholder rows for the Users list.

export function UsersListSkeleton() {
  return (
    <div role="status" aria-label="Loading users" className="space-y-1 px-6 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
