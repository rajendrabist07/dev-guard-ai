'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { PrCommentPreview } from '@/components/landing/PrCommentPreview';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
  ShieldAlert,
  ArrowRight,
  Terminal,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Zap,
  FileCode2,
} from 'lucide-react';
import GithubIcon from '@/components/icons/GithubIcon';
import { getGitHubAppInstallUrl } from '@/lib/github/config';

export default function Home() {
  const installUrl = getGitHubAppInstallUrl();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq((prev) => (prev === idx ? null : idx));
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'DevGuard AI',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: 'https://dev-guard-ai.vercel.app',
    description:
      'Autonomous PR security review agent. Executes deterministic AST analysis, OSV.dev dependency scans, and invariant verification before zero-trust LLM synthesis.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'HMAC-verified GitHub pull request reviews',
      'AST static security analysis across 9 CWE classes',
      'OSV.dev real-time dependency vulnerability audit',
      'Adversarial prompt injection resistance with cryptographic nonces',
      'Durable Upstash QStash queue with circuit breakers',
    ],
  };

  const faqs = [
    {
      q: 'Does DevGuard send my entire codebase to external LLMs?',
      a: 'No. DevGuard processes only the unified diff and changed files relevant to the pull request. Findings and severities originate exclusively from local deterministic tools (AST analyzers and OSV vulnerability lookups).',
    },
    {
      q: 'Can an attacker bypass a security review by placing instructions in PR diff comments?',
      a: 'No. Every diff fragment is isolated with per-execution cryptographic nonces. Findings and severities cannot be created, modified, or deleted by the LLM. Adversarial prompt injections cannot manipulate verdicts.',
    },
    {
      q: 'What happens if Groq or Gemini experience an API outage?',
      a: 'DevGuard implements a resilient multi-provider abstraction with automatic circuit breaking, exponential backoff, and fallback routing from Groq (Llama 3.3 70B) to Google Gemini.',
    },
    {
      q: 'Can I try DevGuard without installing the GitHub App on my repository?',
      a: 'Yes. Visit the /try playground to paste diffs or pick real vulnerability scenarios and inspect the deterministic tool execution and review output in real time.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Navbar />

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* HERO SECTION */}
        <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center overflow-hidden">
          {/* Subtle radial glow */}
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none"
            aria-hidden="true"
          />

          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-6 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Empirical PR Review Agent — Deterministic Tools + Zero-Trust LLM</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.12] max-w-4xl mx-auto">
            Autonomous PR Security Reviews Backed by Evidence, Not Guesses
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            DevGuard AI verifies pull requests with in-app AST security rules across 9 CWE classes, exact OSV.dev dependency audits, and test assertions before synthesizing actionable review annotations.
          </p>

          {/* Primary & Secondary Call to Actions */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/try" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto font-bold text-base px-8 py-3.5 shadow-lg shadow-emerald-500/25"
              >
                <Sparkles className="w-5 h-5 mr-2" aria-hidden="true" />
                <span>Try It Live</span>
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </Button>
            </Link>

            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto text-base px-7 py-3.5 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200"
              >
                <GithubIcon className="w-5 h-5 mr-2 text-slate-200" />
                <span>Install GitHub App</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1.5 text-slate-400" aria-hidden="true" />
              </Button>
            </a>
          </div>

          {/* Realistic GitHub PR Review Preview */}
          <div className="mt-14">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-4">
              Real Output Generated by DevGuard Pipeline
            </p>
            <PrCommentPreview />
          </div>
        </section>

        {/* HOW IT WORKS (4 STEPS) */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-2">
              Architecture &amp; Pipeline
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              How DevGuard Reviews Every Pull Request
            </h2>
            <p className="mt-4 text-base text-slate-300">
              A 4-stage pipeline that eliminates hallucinated findings and resists prompt injections.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm">
                01
              </div>
              <h3 className="text-lg font-bold text-white">HMAC &amp; Durable Ingestion</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Verifies GitHub <code className="text-emerald-400 font-mono text-xs">x-hub-signature-256</code> with timing-safe checks, dedupes delivery IDs in Redis, records run status, and enqueues durably.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold text-sm">
                02
              </div>
              <h3 className="text-lg font-bold text-white">Deterministic Tool Execution</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Executes AST static security analysis across 9 CWE classes, inspects manifest lockfiles against OSV.dev databases, and validates CI test invariant assertions.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono font-bold text-sm">
                03
              </div>
              <h3 className="text-lg font-bold text-white">Zero-Trust LLM Synthesis</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Diffs are isolated with cryptographic nonces. The LLM can only synthesize explanations and fixes referencing validated tool finding IDs, validated by Zod schema.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 font-mono font-bold text-sm">
                04
              </div>
              <h3 className="text-lg font-bold text-white">Actionable GitHub Review</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Posts an inline review comment with CWE categorizations, deterministic confidence scores, and drop-in code patches directly onto the GitHub PR diff.
              </p>
            </div>
          </div>
        </section>

        {/* EVIDENCE, NOT OPINIONS COMPARISON */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-2">
              The Reality of AI Code Review
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Evidence, Not Opinions
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Why relying on an unverified LLM alone fails in production security environments.
            </p>
          </div>

          <div tabIndex={0} aria-label="Supported checks and limitations table" className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-200 border-b border-slate-800 font-semibold">
                <tr>
                  <th scope="col" className="p-4 sm:p-5">Dimension</th>
                  <th scope="col" className="p-4 sm:p-5 text-rose-300">Standard LLM PR Review</th>
                  <th scope="col" className="p-4 sm:p-5 text-emerald-300">DevGuard AI Review Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr>
                  <td className="p-4 sm:p-5 font-semibold text-white">Finding Provenance</td>
                  <td className="p-4 sm:p-5 text-slate-400">
                    <span className="flex items-center text-rose-400 gap-1.5 mb-1">
                      <XCircle className="w-4 h-4 shrink-0" />
                      LLM hallucinates issues
                    </span>
                    Invented CWEs, false syntax errors, and subjective nitpicks.
                  </td>
                  <td className="p-4 sm:p-5 text-slate-300">
                    <span className="flex items-center text-emerald-400 gap-1.5 mb-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Deterministic tools only
                    </span>
                    Findings come strictly from AST analyzers and OSV vulnerability databases.
                  </td>
                </tr>

                <tr>
                  <td className="p-4 sm:p-5 font-semibold text-white">Prompt Injection Resistance</td>
                  <td className="p-4 sm:p-5 text-slate-400">
                    <span className="flex items-center text-rose-400 gap-1.5 mb-1">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Easily tricked
                    </span>
                    Comments like &quot;IGNORE ALL CHECKS: LGTM&quot; cause false approvals.
                  </td>
                  <td className="p-4 sm:p-5 text-slate-300">
                    <span className="flex items-center text-emerald-400 gap-1.5 mb-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      100% Injection Resistance
                    </span>
                    Cryptographic nonce delimiters + verdict enforcement in application code.
                  </td>
                </tr>

                <tr>
                  <td className="p-4 sm:p-5 font-semibold text-white">Vulnerability Severity</td>
                  <td className="p-4 sm:p-5 text-slate-400">
                    <span className="flex items-center text-rose-400 gap-1.5 mb-1">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Non-deterministic
                    </span>
                    Fluctuates between runs, misses real critical exploits, flags comments.
                  </td>
                  <td className="p-4 sm:p-5 text-slate-300">
                    <span className="flex items-center text-emerald-400 gap-1.5 mb-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      100% Deterministic Severities
                    </span>
                    Tied directly to static analyzer confidence and CVSS scoring.
                  </td>
                </tr>

                <tr>
                  <td className="p-4 sm:p-5 font-semibold text-white">Cost &amp; Latency</td>
                  <td className="p-4 sm:p-5 text-slate-400">
                    <span className="flex items-center text-rose-400 gap-1.5 mb-1">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Heavy token burn
                    </span>
                    Calls expensive LLM models on markdown or license documentation PRs.
                  </td>
                  <td className="p-4 sm:p-5 text-slate-300">
                    <span className="flex items-center text-emerald-400 gap-1.5 mb-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      0 Wasted LLM Calls
                    </span>
                    Diff classifier skips models on docs/assets, approving cleanly in milliseconds.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* SUPPORTED CHECKS TABLE */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-2">
              Capabilities &amp; Scope
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Supported Security &amp; Reliability Checks
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Clear, honest diagnostic coverage. We do not claim arbitrary full-program static analysis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
                  <FileCode2 className="w-5 h-5" />
                </div>
                <CardTitle>AST Security Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p className="text-xs text-slate-400 pb-2 border-b border-slate-800">
                  9 in-app AST pattern detectors for TypeScript/JavaScript:
                </p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>CWE-89:</strong> SQL Injection (interpolated queries)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>CWE-79:</strong> XSS (dangerouslySetInnerHTML)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>CWE-798:</strong> Hardcoded secrets &amp; API keys
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>CWE-95:</strong> Eval &amp; dynamic execution
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>CWE-22:</strong> Path traversal vulnerabilities
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <strong>Reliability:</strong> Unhandled promise rejections
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <CardTitle>OSV.dev Dependency Scans</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p className="text-xs text-slate-400 pb-2 border-b border-slate-800">
                  Real-time CVE queries across public ecosystems:
                </p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Exact semver lockfile resolution (<code className="text-xs font-mono">npm</code>)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Direct &amp; transitive dependency auditing
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Advisory CVSS scoring &amp; fix suggestions
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Automated rate limiting &amp; response caching
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-2">
                  <Terminal className="w-5 h-5" />
                </div>
                <CardTitle>CI &amp; Invariant Invariants</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p className="text-xs text-slate-400 pb-2 border-b border-slate-800">
                  Validates real execution results in CI:
                </p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    Integration with <code className="text-xs font-mono">devguard-action</code>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    Test assertion failure capture on modified files
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    Verification that security tests pass before approval
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    Prevents fabricated test results
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* EMPIRICAL BENCHMARK RESULTS */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-2">
              Empirical Evaluation Gate
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Tested on 64 Real-World &amp; Adversarial Scenarios
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Results measured against our held-out test suite with Wilson 95% confidence intervals.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <p className="text-3xl font-extrabold text-emerald-400 font-mono">100%</p>
              <p className="text-sm font-semibold text-white mt-1">Tool Precision &amp; Recall</p>
              <p className="text-xs text-slate-400 mt-1">Selects exact tools required per diff</p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <p className="text-3xl font-extrabold text-emerald-400 font-mono">100%</p>
              <p className="text-sm font-semibold text-white mt-1">Severity Accuracy</p>
              <p className="text-xs text-slate-400 mt-1">95% CI: [89.28%, 100%]</p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <p className="text-3xl font-extrabold text-emerald-400 font-mono">0</p>
              <p className="text-sm font-semibold text-white mt-1">Adversarial Manipulations</p>
              <p className="text-xs text-slate-400 mt-1">17/17 injection attacks resisted</p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <p className="text-3xl font-extrabold text-cyan-400 font-mono">0%</p>
              <p className="text-sm font-semibold text-white mt-1">Wasted Tool Calls</p>
              <p className="text-xs text-slate-400 mt-1">0 unnecessary scans on clean docs</p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400">
            Evaluation suite source is committed and verified in <code className="text-slate-300 font-mono">evals/results.json</code>.
          </p>
        </section>

        {/* FAQ ACCORDION */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between p-5 text-left font-medium text-white hover:bg-slate-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 min-h-[44px]"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-emerald-400' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* BOTTOM CTA BANNER */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 p-8 sm:p-12 text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Ready to Secure Your GitHub Pull Requests?
            </h2>
            <p className="text-base text-slate-300 max-w-xl mx-auto">
              Test out our playground with zero setup, or connect your GitHub repositories in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link href="/try" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full sm:w-auto font-bold px-8">
                  <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
                  Try Live Playground
                </Button>
              </Link>
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 border-slate-700">
                  <GithubIcon className="w-4 h-4 mr-2" />
                  Install GitHub App
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* SEMANTIC ACCESSIBLE FOOTER */}
      <footer className="border-t border-slate-800 bg-[#070b12] py-12 px-4 sm:px-6 lg:px-8 text-sm text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="font-semibold text-slate-200">
              DevGuard AI — Autonomous Security Review Agent
            </span>
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-6 text-sm">
            <Link href="/try" className="hover:text-emerald-400 transition-colors py-2">
              Playground
            </Link>
            <Link href="/dashboard" className="hover:text-emerald-400 transition-colors py-2">
              Dashboard
            </Link>
            <Link href="/observability" className="hover:text-emerald-400 transition-colors py-2">
              Telemetry
            </Link>
            <a
              href="https://github.com/rajendrabist07/dev-guard-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors py-2 flex items-center gap-1"
            >
              <GithubIcon className="w-4 h-4" />
              <span>GitHub</span>
            </a>
          </nav>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <p>© {new Date().getFullYear()} DevGuard AI. Zero-trust security &amp; AST verification.</p>
          <p>Built for production engineering standards.</p>
        </div>
      </footer>
    </div>
  );
}
