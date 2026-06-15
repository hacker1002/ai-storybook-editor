// styles-grid-skeleton.tsx — Loading placeholder for the styles grid (6 pulsing cards).
// Inline skeleton (no Skeleton primitive in src/components/ui) — ported from VoicesPage GridSkeleton.

export function StylesGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading styles"
      className="grid grid-cols-1 gap-4 px-6 py-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-44 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
