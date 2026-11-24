'use client';

import React from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <ErrorState
        title="Failed to Load Dashboard"
        message={error.message || 'An error occurred while loading dashboard telemetry and review runs.'}
        onRetry={() => reset()}
      />
    </div>
  );
}
