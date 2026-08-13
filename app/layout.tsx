import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevGuard AI — Autonomous PR Review & Security Agent',
  description: 'An agentic AI review bot that actively calls linters, vulnerability scanners, and test runners to deliver empirical code reviews.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0f19] text-gray-100 min-h-screen selection:bg-emerald-500/30 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}
