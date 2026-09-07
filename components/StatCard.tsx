export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="text-meta font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-2 text-figure-lg font-medium leading-[1.3] text-text-primary">{value}</div>
    </div>
  );
}
