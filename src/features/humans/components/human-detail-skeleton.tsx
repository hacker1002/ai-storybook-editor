// human-detail-skeleton.tsx — Loading placeholder for human detail page.

export function HumanDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading human" className="mx-auto w-full max-w-3xl space-y-4 px-6 py-4">
      <div className="h-10 w-48 bg-muted animate-pulse rounded-md" />
      <div className="h-24 bg-muted animate-pulse rounded-md" />
      <div className="h-40 bg-muted animate-pulse rounded-md" />
      <div className="h-40 bg-muted animate-pulse rounded-md" />
    </div>
  );
}
