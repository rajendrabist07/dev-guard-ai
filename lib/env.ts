import { z } from 'zod';

const FORBIDDEN_CLIENT_SECRETS = [
  'NEXT_PUBLIC_GROQ_API_KEY',
  'NEXT_PUBLIC_GEMINI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY',
  'NEXT_PUBLIC_GITHUB_PRIVATE_KEY',
  'NEXT_PUBLIC_GITHUB_WEBHOOK_SECRET',
  'NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN',
];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  // LLM Providers (Server-Only)
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Supabase (Server-Only & Client-Safe)
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // GitHub App / Integration (Server-Only)
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_PERSONAL_ACCESS_TOKEN: z.string().optional(),

  // GitHub App Links (Client-Safe)
  GITHUB_APP_SLUG: z.string().optional(),
  NEXT_PUBLIC_GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_INSTALL_URL: z.string().optional(),
  NEXT_PUBLIC_GITHUB_APP_INSTALL_URL: z.string().optional(),

  // Upstash Redis (Server-Only)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Admin Access Control (Server-Only)
  ADMIN_GITHUB_LOGINS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : []
    ),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(customEnv: Record<string, string | undefined> = process.env): Env {
  // Check for forbidden client-exposed secrets
  for (const secret of FORBIDDEN_CLIENT_SECRETS) {
    if (customEnv[secret]) {
      throw new Error(`CRITICAL SECURITY ERROR: Server secret exposed with client prefix ${secret}!`);
    }
  }

  // Also check if any key ending in _KEY, _SECRET, _TOKEN has NEXT_PUBLIC_
  for (const key of Object.keys(customEnv)) {
    if (
      key.startsWith('NEXT_PUBLIC_') &&
      (key.includes('SERVICE_KEY') ||
        key.includes('PRIVATE_KEY') ||
        key.includes('WEBHOOK_SECRET') ||
        key.endsWith('API_KEY')) &&
      !key.includes('ANON_KEY') // Supabase anon key is explicitly designed to be public
    ) {
      throw new Error(`CRITICAL SECURITY ERROR: Potentially sensitive secret exposed with client prefix ${key}!`);
    }
  }

  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }

  return result.data;
}

/**
 * Ensures only explicitly client-safe (NEXT_PUBLIC_) environment variables
 * can ever be forwarded to client-accessible bundles.
 */
export function sanitizeServerEnvForClient(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const safeEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_') && value !== undefined) {
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}

export const env = (() => {
  // In test or build environments, evaluate safely
  try {
    return validateEnv();
  } catch (err) {
    if (process.env.NODE_ENV === 'test') {
      return {} as Env;
    }
    throw err;
  }
})();
