'use client';

import React from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

export default function ObservabilityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <ErrorState
        title="Failed to Load System Observability"
        message={error.message || 'An error occurred while loading health telemetry and service statuses.'}
        onRetry={() => reset()}
      />
    </div>
  );
}
