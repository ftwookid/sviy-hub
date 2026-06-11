export function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="h-4 w-1/3 rounded bg-subtle" />
          <div className="mt-3 h-3 w-2/3 rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}
