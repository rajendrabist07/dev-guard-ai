'use client';

import Link from 'next/link';
import { ShieldAlert, Github, LayoutDashboard, Cpu } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-800/80 bg-[#0b0f19]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 p-0.5 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-[#0b0f19] rounded-[10px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg text-white tracking-tight flex items-center gap-1.5">
              DevGuard <span className="text-emerald-400 font-extrabold">AI</span>
            </span>
            <span className="text-[10px] text-gray-400 font-mono tracking-wider">AUTONOMOUS PR AGENT</span>
          </div>
        </Link>

        <nav className="flex items-center space-x-6">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 text-sm font-medium text-gray-300 hover:text-emerald-400 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub App</span>
          </a>
          <Link
            href="/dashboard?simulate=true"
            className="flex items-center space-x-2 text-xs font-semibold px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-all shadow-sm shadow-emerald-950"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Test Agent Live</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
