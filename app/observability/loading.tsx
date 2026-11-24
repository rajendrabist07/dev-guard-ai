import { Skeleton } from '@/components/ui/Skeleton';

export default function ObservabilityLoading() {
  return (
    <div
      role="status"
      aria-label="Loading system observability"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-64 w-full" />
      </div>
      <span className="sr-only">Loading observability health checks and traces...</span>
    </div>
  );
}
