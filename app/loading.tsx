export default function GlobalLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page content"
      className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-6 space-y-4"
    >
      <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
      <span className="text-sm font-medium text-slate-400 tracking-wide animate-pulse">
        Loading DevGuard AI...
      </span>
      <span className="sr-only">Loading, please wait...</span>
    </div>
  );
}
