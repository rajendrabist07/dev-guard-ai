import * as Sentry from '@sentry/nextjs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  action?: string;
  reviewRunId?: string;
  repoFullName?: string;
  prNumber?: number | string;
  provider?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_PATTERNS = [
  /sk_live_[a-zA-Z0-9_-]+/gi,
  /ghp_[a-zA-Z0-9_-]+/gi,
  /AIza[0-9A-Za-z-_]{35}/gi,
  /eyJhbGciOi[a-zA-Z0-9_.-]+/gi, // JWT
  /(?:password|secret|key|token|signature|authorization)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi,
];

/**
 * Strips all sensitive credentials, tokens, JWTs, and keys before logging or reporting.
 */
export function scrubSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    let sanitized = input;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  if (Array.isArray(input)) {
    return input.map(scrubSecrets);
  }

  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('signature') ||
        lowerKey.includes('auth')
      ) {
        output[key] = '[REDACTED_SECRET]';
      } else {
        output[key] = scrubSecrets(value);
      }
    }
    return output;
  }

  return input;
}

/**
 * Structured logger writing clean, timestamped, module-scoped JSON payloads.
 */
export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'development') {
      const safeCtx = scrubSecrets(context) as LogContext | undefined;
      console.debug(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'debug',
          message,
          ...safeCtx,
        })
      );
    }
  },

  info(message: string, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        ...safeCtx,
      })
    );
  },

  warn(message: string, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message,
        ...safeCtx,
      })
    );

    // Send high-signal warning breadcrumb to Sentry
    if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: context?.module || 'application',
        message: String(scrubSecrets(message)),
        level: 'warning',
        data: safeCtx,
      });
    }
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    const errorMessage = error instanceof Error ? error.message : String(error || message);
    const safeErrorMsg = String(scrubSecrets(errorMessage));

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: String(scrubSecrets(message)),
        error: safeErrorMsg,
        stack: error instanceof Error ? scrubSecrets(error.stack) : undefined,
        ...safeCtx,
      })
    );

    // Report error to Sentry with sanitized structured context
    if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (safeCtx) {
          scope.setExtras(safeCtx);
        }
        if (context?.module) {
          scope.setTag('module', context.module);
        }
        if (context?.action) {
          scope.setTag('action', context.action);
        }
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage(`${message}: ${safeErrorMsg}`, 'error');
        }
      });
    }
  },
};
