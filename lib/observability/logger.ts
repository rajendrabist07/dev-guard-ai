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
  /(?:Bearer|Token)\s+[a-zA-Z0-9_\-\.=]+/gi,
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9_-]+/gi,
  /github_pat_[a-zA-Z0-9_=-]+/gi,
  /gsk_[a-zA-Z0-9_-]+/gi,
  /AIza[0-9A-Za-z-_]{35}/gi,
  /sk_(?:live|test)_[a-zA-Z0-9_-]+/gi,
  /eyJ[a-zA-Z0-9_=-]+\.[a-zA-Z0-9_=-]+\.[a-zA-Z0-9_=-]+/gi,
  /(?:password|secret|key|token|signature|apikey)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi,
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
      const isSensitiveKey =
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('signature') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey === 'key' ||
        lowerKey === 'authorization' ||
        lowerKey === 'auth_header';

      if (value !== null && typeof value === 'object') {
        output[key] = scrubSecrets(value);
      } else if (isSensitiveKey) {
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

  // Asynchronously persist to Supabase if configured (fire and forget)
  void persistLogToDatabase(entry);
}

async function persistLogToDatabase(entry: StructuredLogEntry) {
  try {
    // Only attempt if supabase environment variables exist
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { getSupabaseAdmin } = await import('@/lib/db/supabase');
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin.from('system_logs').insert({
          level: entry.level,
          message: entry.message,
          error: entry.error,
          context: entry.context || {},
        });
      }
    }
  } catch {
    // Non-blocking: background logging failures must never crash runtime requests
  }
}

/**
 * Retrieves recent structured logs with persistent database fallback.
 */
export async function fetchStructuredLogs(limit = 50): Promise<StructuredLogEntry[]> {
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { getSupabaseAdmin } = await import('@/lib/db/supabase');
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data, error } = await admin
          .from('system_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          return (data as unknown as Array<{ id: string; created_at: string; level: LogLevel; message: string; error?: string; context?: LogContext }>).map((d) => ({
            id: d.id,
            timestamp: d.created_at,
            level: d.level as LogLevel,
            message: d.message,
            error: d.error,
            context: (d.context as LogContext) || undefined,
          }));
        }
      }
    }
  } catch {
    // Fall back to in-memory buffer
  }

  return getRecentStructuredLogs(limit);
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
