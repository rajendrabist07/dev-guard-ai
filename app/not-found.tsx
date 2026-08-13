import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0b0f19] text-gray-100 flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-sm font-mono text-emerald-400">404</p>
        <h1 className="text-2xl font-bold text-white">Page not found</h1>
        <p className="text-sm text-gray-400">The requested DevGuard AI page does not exist.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
        >
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
