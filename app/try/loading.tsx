import { Skeleton } from '@/components/ui/Skeleton';

export default function TryLoading() {
  return (
    <div
      role="status"
      aria-label="Loading playground"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading security analysis playground...</span>
    </div>
  );
}
