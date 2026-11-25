import { jsonResponse, messageOnly } from '../helpers';

export const systemSchemas = {
  HealthResponse: {
    type: 'object',
    required: ['status', 'timestamp', 'services'],
    properties: {
      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
      timestamp: { type: 'string', format: 'date-time' },
      services: {
        type: 'object',
        properties: {
          supabase: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['connected', 'not_configured', 'error'] },
              message: { type: 'string' },
            },
          },
          githubApp: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['configured', 'not_configured', 'invalid'] },
              appId: { type: 'string' },
              message: { type: 'string' },
            },
          },
          aiProviders: {
            type: 'object',
            properties: {
              groq: { type: 'boolean' },
              gemini: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
};

export const systemPaths = {
  '/api/health': {
    get: {
      tags: ['System & Observability'],
      summary: 'Live system health and dependency check',
      description:
        'Probes Supabase PostgreSQL connectivity, GitHub App JWT authentication, and AI provider key availability without exposing secret values.',
      security: [],
      responses: {
        '200': jsonResponse('Service is healthy or degraded', { $ref: '#/components/schemas/HealthResponse' }),
        '503': jsonResponse('Service is unhealthy', { $ref: '#/components/schemas/HealthResponse' }),
      },
    },
  },
  '/api/observability': {
    get: {
      tags: ['System & Observability'],
      summary: 'Operational telemetry, cache hit rates, and recent redacted logs',
      description:
        'Aggregates live database/Redis ping latencies, provider fallback counts, OSV cache hit rates, and redacted structured logs.',
      security: [],
      responses: {
        '200': jsonResponse('Live observability telemetry snapshot', {
          type: 'object',
          additionalProperties: true,
        }),
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/cron/watchdog': {
    get: {
      tags: ['System & Observability'],
      summary: 'Recover stuck running review jobs (Vercel Cron)',
      description:
        'Authorized by `CRON_SECRET` Bearer token in production. Finds review runs stuck in `running` past 300 seconds and idempotently transitions them to `timed_out`.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': messageOnly('Watchdog sweep completed', {
          status: 'success',
          stuckRunsCount: 0,
          timedOutCount: 0,
          timedOutRunIds: [],
          timestamp: '2026-11-25T12:00:00.000Z',
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/cron/retention': {
    get: {
      tags: ['System & Observability'],
      summary: 'Purge expired try runs, logs, and webhook deliveries (Vercel Cron)',
      description:
        'Authorized by `CRON_SECRET` Bearer token in production. Deletes expired `try_runs`, `system_logs` older than 14 days, and `webhook_deliveries` older than 7 days.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': messageOnly('Retention cleanup completed', {
          status: 'success',
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
};
