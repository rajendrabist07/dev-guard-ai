import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ShieldCheck, Cpu, ArrowRight, Zap, Code2, Layers } from 'lucide-react';

export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'DevGuard AI',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: 'https://dev-guard-ai.vercel.app',
    description:
      'An autonomous pull request review and security agent that runs linters, dependency vulnerability scans, and tests before producing structured review findings.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'GitHub pull request webhook reviews',
      'Webhook signature verification',
      'Tool-backed lint, dependency, and test checks',
      'Structured severity-tagged findings',
      'Supabase-backed review history dashboard',
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-gray-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-8 animate-fade-in shadow-sm shadow-emerald-950">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Empirical Tool-Calling Agent — Not Just Plain Diff Comments</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.15] max-w-4xl mx-auto">
          Autonomous PR Security & Code Review for Developers
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto font-normal leading-relaxed">
          DevGuard AI acts as an active security engineer on every pull request. It executes AST static linters, checks OSV vulnerability databases, and runs tests before rendering structured inline feedback.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all flex items-center justify-center space-x-2"
          >
            <span>Open Security Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dashboard?simulate=true"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-200 font-semibold text-sm hover:border-gray-700 hover:bg-gray-800 transition-all flex items-center justify-center space-x-2"
          >
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Simulate PR Review Live</span>
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-emerald-500/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Cpu className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Agentic Multi-Step Loop</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              The LLM orchestrator chooses tools, inspects outputs, and refines findings up to 5 iterations before producing inline PR annotations.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-emerald-500/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Real Tool Integration</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Wraps AST linter checks, OSV.dev vulnerability databases for <code className="text-emerald-300">package.json</code>, and unit test suites for zero hallucinations.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-emerald-500/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Code2 className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Inline GitHub Review Annotations</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Posts formatted reviews with 1-click GitHub copyable suggestions, severity tagging (Critical, Warning, Info), and file line markers.
            </p>
          </div>
        </div>

        {/* Live Architecture Visualizer */}
        <div className="mt-20 p-8 rounded-2xl bg-gray-900/40 border border-gray-800 text-left space-y-6">
          <div className="flex items-center space-x-3 border-b border-gray-800 pb-4">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">System Architecture & Tool Orchestration Pipeline</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
              <div className="text-emerald-400 font-mono font-bold">1. GitHub Webhook</div>
              <p className="text-gray-400">Triggers on PR <code className="text-gray-300">opened</code> / <code className="text-gray-300">synchronize</code>, verifies HMAC-SHA256 signature.</p>
            </div>
            <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
              <div className="text-emerald-400 font-mono font-bold">2. Agent Orchestrator</div>
              <p className="text-gray-400">Groq Llama 3.3 70B with Gemini 2.5 Flash fallback evaluates PR diff and chooses execution tools.</p>
            </div>
            <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
              <div className="text-emerald-400 font-mono font-bold">3. Tool Verification</div>
              <p className="text-gray-400">Runs AST linter, OSV vulnerability scan, and test suite runner to gather concrete evidence.</p>
            </div>
            <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
              <div className="text-emerald-400 font-mono font-bold">4. GitHub Review Post</div>
              <p className="text-gray-400">Posts structured findings with inline line comments & suggested code replacement fixes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-800/80 py-8 text-center text-xs text-gray-500 font-mono">
        DevGuard AI • Autonomous PR Review & Security Agent • Built with Next.js 15, Groq, Gemini & Supabase
      </footer>
    </div>
  );
}
