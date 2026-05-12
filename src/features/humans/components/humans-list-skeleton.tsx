// humans-list-skeleton.tsx — Loading state placeholder rows.

export function HumansListSkeleton() {
  return (
    <div role="status" aria-label="Loading humans" className="space-y-1 px-6 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
