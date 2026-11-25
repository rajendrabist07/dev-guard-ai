import { errorResponse } from './helpers';
import { authPaths, authSchemas } from './features/auth.docs';
import { reviewsPaths, reviewsSchemas } from './features/reviews.docs';
import { tryPaths, trySchemas } from './features/try.docs';
import { webhooksPaths, webhooksSchemas } from './features/webhooks.docs';
import { systemPaths, systemSchemas } from './features/system.docs';

export function buildOpenApiDocument(baseUrl?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'DevGuard AI — Security Review Agent API',
      version: '1.0.0',
      description:
        'Modular OpenAPI 3.1.0 specification derived directly from DevGuard AI Zod validation schemas and Next.js App Router handlers. Covers GitHub App webhook ingestion, Upstash QStash durable workers, interactive playground execution, tenant-scoped dashboard queries, and live observability endpoints.',
      contact: {
        name: 'DevGuard AI Maintainers',
        url: 'https://github.com/rajendrabist07/dev-guard-ai',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      ...(baseUrl ? [{ url: baseUrl, description: 'Current Deployment' }] : []),
      {
        url: '/',
        description: 'Relative Origin Server',
      },
    ],
    tags: [
      { name: 'Authentication', description: 'Supabase Auth session verification and signout' },
      { name: 'Dashboard & Reviews', description: 'Tenant-scoped PR review history, findings, and SVG badges' },
      { name: 'Interactive Playground', description: 'Public rate-limited PR review sandbox and shareable results' },
      { name: 'Webhooks & Queue Pipeline', description: 'HMAC-verified GitHub webhooks, OIDC CI ingest, and QStash workers' },
      { name: 'System & Observability', description: 'Health checks, telemetry, watchdog, and retention crons' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-auth-token',
          description: 'Supabase Auth session cookie established via GitHub OAuth',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer JWT (Supabase access token, GitHub Actions OIDC token, or CRON_SECRET)',
        },
        githubWebhookHmac: {
          type: 'apiKey',
          in: 'header',
          name: 'x-hub-signature-256',
          description: 'GitHub HMAC-SHA256 webhook signature (`sha256=<hex>`)',
        },
        qstashSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'upstash-signature',
          description: 'Upstash QStash cryptographic request signature',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            details: { type: ['object', 'string', 'null'], additionalProperties: true },
            retryAfterMs: { type: 'integer' },
          },
        },
        ...authSchemas,
        ...reviewsSchemas,
        ...trySchemas,
        ...webhooksSchemas,
        ...systemSchemas,
      },
      responses: {
        ValidationError: errorResponse('Request validation failed', 'Invalid request payload'),
        Unauthorized: errorResponse('Missing, invalid, or expired authentication credentials', 'Authentication required'),
        Forbidden: errorResponse('Authenticated user lacks access to the requested resource', 'Access denied'),
        NotFound: errorResponse('Requested resource does not exist or has expired', 'Resource not found'),
        TooManyRequests: errorResponse(
          'Rate limit exceeded (5 requests per 10 minutes per IP)',
          'Rate limit exceeded. Please wait before retrying.'
        ),
        ServerError: errorResponse('Internal server error', 'An unexpected server error occurred'),
      },
    },
    paths: {
      ...authPaths,
      ...reviewsPaths,
      ...tryPaths,
      ...webhooksPaths,
      ...systemPaths,
    },
  };
}
