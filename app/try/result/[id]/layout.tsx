import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playground Security Analysis Result — DevGuard AI',
  description: 'Automated static analysis and vulnerability evaluation results generated in the DevGuard AI playground.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TryResultLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
