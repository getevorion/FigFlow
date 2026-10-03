export default function Loading() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 animate-pulse rounded-md bg-[var(--kv-border-subtle)]" />
      <div className="h-32 animate-pulse rounded-[14px] bg-[var(--kv-border-subtle)]" />
      <div className="h-32 animate-pulse rounded-[14px] bg-[var(--kv-border-subtle)]" />
    </div>
  );
}
