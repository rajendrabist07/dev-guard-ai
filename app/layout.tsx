import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

const siteUrl = 'https://dev-guard-ai.vercel.app';
const title = 'DevGuard AI — Autonomous PR Security & Empirical Review Agent';
const description =
  'Autonomous pull request review agent that verifies code via AST static analysis, OSV.dev dependency vulnerability scans, and invariant assertions before AI synthesis.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: 'DevGuard AI',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'DevGuard AI',
    title,
    description,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'DevGuard AI autonomous pull request security review preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#090d16] text-slate-100 min-h-screen selection:bg-emerald-500/30 selection:text-emerald-300 font-sans antialiased text-base">
        {/* Skip to Content for Screen Readers & Keyboard Users (WCAG AA) */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>
          <div id="root-portal" />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
