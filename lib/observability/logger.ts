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

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  error?: string;
  context?: LogContext;
}

// In-memory ring buffer for the operational observability dashboard
const LOG_BUFFER_CAPACITY = 100;
const inMemoryLogBuffer: StructuredLogEntry[] = [];

export function getRecentStructuredLogs(limit = 50): StructuredLogEntry[] {
  return inMemoryLogBuffer.slice(-limit).reverse();
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

function appendToBuffer(entry: StructuredLogEntry) {
  if (inMemoryLogBuffer.length >= LOG_BUFFER_CAPACITY) {
    inMemoryLogBuffer.shift();
  }
  inMemoryLogBuffer.push(entry);
}

/**
 * Structured logger writing clean, timestamped, module-scoped JSON payloads.
 */
export const logger = {
  debug(message: string, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    const entry: StructuredLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'debug',
      message: String(scrubSecrets(message)),
      context: safeCtx,
      ...safeCtx,
    };
    appendToBuffer(entry);

    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify(entry));
    }
  },

  info(message: string, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    const entry: StructuredLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      message: String(scrubSecrets(message)),
      context: safeCtx,
      ...safeCtx,
    };
    appendToBuffer(entry);
    console.log(JSON.stringify(entry));
  },

  warn(message: string, context?: LogContext) {
    const safeCtx = scrubSecrets(context) as LogContext | undefined;
    const entry: StructuredLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: String(scrubSecrets(message)),
      context: safeCtx,
      ...safeCtx,
    };
    appendToBuffer(entry);
    console.warn(JSON.stringify(entry));

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

    const entry: StructuredLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'error',
      message: String(scrubSecrets(message)),
      error: safeErrorMsg,
      context: safeCtx,
      ...safeCtx,
    };
    appendToBuffer(entry);

    console.error(
      JSON.stringify({
        ...entry,
        stack: error instanceof Error ? scrubSecrets(error.stack) : undefined,
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
