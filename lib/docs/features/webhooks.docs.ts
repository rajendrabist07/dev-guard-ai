import { z } from 'zod';
import { body, jsonResponse, messageOnly, schemaToJson } from '../helpers';
import { GitHubWebhookHeadersSchema } from '@/lib/validation/schemas';

const IngestBodySchema = z.object({
  repository: z.string().min(1),
  sha: z.string().min(1),
  ref: z.string().optional(),
  runId: z.union([z.string(), z.number()]).optional(),
  semgrep: z.record(z.string(), z.unknown()).optional(),
  osv: z.record(z.string(), z.unknown()).optional(),
  tests: z
    .object({
      command: z.string(),
      exitCode: z.number(),
      passed: z.boolean(),
      durationMs: z.number(),
      outputSnippet: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const ReviewJobPayloadSchema = z.object({
  reviewRunId: z.string().uuid(),
  installationId: z.number().int(),
  repoFullName: z.string(),
  prNumber: z.number().int(),
  commitSha: z.string(),
  prTitle: z.string(),
  prAuthor: z.string(),
  correlationId: z.string(),
  attempt: z.number().int().optional(),
});

export const webhooksSchemas = {
  GitHubWebhookHeaders: schemaToJson(GitHubWebhookHeadersSchema),
  IngestPayload: schemaToJson(IngestBodySchema),
  ReviewJobPayload: schemaToJson(ReviewJobPayloadSchema),
};

export const webhooksPaths = {
  '/api/webhooks/github': {
    post: {
      tags: ['Webhooks & Queue Pipeline'],
      summary: 'Receive and enqueue GitHub Pull Request webhooks',
      description:
        'Enforces 5MB payload cap, timing-safe HMAC-SHA256 signature verification (`x-hub-signature-256`), replay deduplication via `x-github-delivery`, atomic run creation (`ON CONFLICT DO NOTHING`), and asynchronous enqueueing to Upstash QStash. Returns `202 Accepted` immediately.',
      security: [{ githubWebhookHmac: [] }],
      parameters: [
        {
          name: 'x-hub-signature-256',
          in: 'header',
          required: true,
          description: 'HMAC-SHA256 signature (`sha256=<hex>`)',
          schema: { type: 'string' },
        },
        {
          name: 'x-github-event',
          in: 'header',
          required: true,
          description: 'GitHub event type (processes `pull_request`)',
          schema: { type: 'string', example: 'pull_request' },
        },
        {
          name: 'x-github-delivery',
          in: 'header',
          required: true,
          description: 'Unique GitHub delivery UUID for replay prevention',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        description: 'Raw GitHub Pull Request webhook event JSON',
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      },
      responses: {
        '200': messageOnly('Duplicate delivery or existing run deduplicated idempotently', {
          message: 'Duplicate webhook delivery ignored (replay prevention)',
        }),
        '202': messageOnly('Webhook verified and review job queued', {
          status: 'accepted',
          reviewRunId: 'c4a9e1c2-9b88-4c1a-8a1e-4d2e7b110022',
        }),
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '413': { description: 'Webhook payload exceeds 5MB limit' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/ingest': {
    post: {
      tags: ['Webhooks & Queue Pipeline'],
      summary: 'Ingest Semgrep, OSV, and test results from devguard-action',
      description:
        'Authenticates GitHub Actions runners via cryptographic OIDC JWT (`Authorization: Bearer <token>`), verifies repository installation ownership, normalizes Semgrep/OSV/test findings, and stores them for correlation during the PR review pipeline.',
      security: [{ bearerAuth: [] }],
      requestBody: body(IngestBodySchema, {
        repository: 'acme-corp/payments-service',
        sha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        ref: 'refs/pull/42/merge',
        runId: '9918273645',
        tests: {
          command: 'npm test',
          exitCode: 0,
          passed: true,
          durationMs: 1420,
        },
      }),
      responses: {
        '200': messageOnly('CI telemetry ingested successfully', {
          success: true,
          ingestedFindingsCount: 2,
        }),
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/api/jobs/review-worker': {
    post: {
      tags: ['Webhooks & Queue Pipeline'],
      summary: 'QStash durable worker for executing PR security reviews',
      description:
        'Verifies Upstash QStash cryptographic signature (`upstash-signature`), executes the idempotent PR review pipeline (`queued -> running -> completed`), and posts inline/summary review comments to GitHub. Returning 500 triggers QStash exponential backoff retries.',
      security: [{ qstashSignature: [] }],
      requestBody: body(ReviewJobPayloadSchema, {
        reviewRunId: 'c4a9e1c2-9b88-4c1a-8a1e-4d2e7b110022',
        installationId: 58392011,
        repoFullName: 'acme-corp/payments-service',
        prNumber: 42,
        commitSha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        prTitle: 'feat: stripe webhook handler',
        prAuthor: 'octocat',
        correlationId: 'corr_83a91c',
        attempt: 1,
      }),
      responses: {
        '200': jsonResponse('Worker completed review run', {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            reviewRunId: { type: 'string', format: 'uuid' },
            findingsCount: { type: 'integer' },
            durationMs: { type: 'integer' },
          },
        }),
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/jobs/dead-letter': {
    post: {
      tags: ['Webhooks & Queue Pipeline'],
      summary: 'QStash dead-letter callback handler',
      description:
        'Verifies `upstash-signature` and transitions permanently failed review jobs (after max QStash retries) to `failed` with `DEAD_LETTER_MAX_RETRIES`.',
      security: [{ qstashSignature: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      },
      responses: {
        '200': messageOnly('Dead-letter event processed', {
          received: true,
          status: 'processed_dead_letter',
        }),
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
};
