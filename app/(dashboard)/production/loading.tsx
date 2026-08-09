export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6" aria-busy="true">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="mb-6">
          <div className="h-9 w-64 rounded bg-muted" />
          <div className="mt-2 h-5 w-80 rounded bg-muted/70" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl border-2 border-border bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
