import { z } from 'zod';
import { jsonResponse, schemaToJson } from '../helpers';
import { BadgeParamsSchema } from '@/lib/validation/schemas';

export const reviewsSchemas = {
  ReviewStatus: {
    type: 'string',
    enum: ['queued', 'running', 'completed', 'failed', 'timed_out'],
  },
  FindingSeverity: {
    type: 'string',
    enum: ['critical', 'warning', 'info'],
  },
  Finding: {
    type: 'object',
    required: ['id', 'review_run_id', 'file_path', 'line', 'severity', 'message'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      review_run_id: { type: 'string', format: 'uuid' },
      file_path: { type: 'string' },
      line: { type: 'integer', minimum: 1 },
      severity: { $ref: '#/components/schemas/FindingSeverity' },
      message: { type: 'string' },
      suggested_fix: { type: ['string', 'null'] },
      tool_source: { type: ['string', 'null'] },
      confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  ReviewRun: {
    type: 'object',
    required: ['id', 'repo_id', 'pr_number', 'commit_sha', 'status', 'created_at'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      repo_id: { type: 'string' },
      pr_number: { type: 'integer' },
      pr_title: { type: ['string', 'null'] },
      pr_author: { type: ['string', 'null'] },
      commit_sha: { type: 'string' },
      status: { $ref: '#/components/schemas/ReviewStatus' },
      tool_calls_count: { type: 'integer' },
      provider_used: { type: ['string', 'null'] },
      model_used: { type: ['string', 'null'] },
      estimated_cost_usd: { type: ['number', 'null'] },
      duration_ms: { type: ['integer', 'null'] },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  DashboardPayload: {
    type: 'object',
    properties: {
      repos: { type: 'array', items: { type: 'object', additionalProperties: true } },
      runs: { type: 'array', items: { $ref: '#/components/schemas/ReviewRun' } },
      stats: { type: 'object', additionalProperties: true },
    },
  },
  ReviewDetailPayload: {
    type: 'object',
    required: ['run', 'findings'],
    properties: {
      run: { $ref: '#/components/schemas/ReviewRun' },
      findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
    },
  },
};

export const reviewsPaths = {
  '/api/dashboard': {
    get: {
      tags: ['Dashboard & Reviews'],
      summary: 'Fetch tenant-scoped dashboard metrics and review runs',
      description:
        'Requires an authenticated Supabase session (`requireUser`). Returns repositories, review runs, and live aggregated statistics scoped strictly to the authenticated user’s verified GitHub App installations.',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        '200': jsonResponse(
          'Tenant-scoped dashboard data',
          { $ref: '#/components/schemas/DashboardPayload' }
        ),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/reviews/{id}': {
    get: {
      tags: ['Dashboard & Reviews'],
      summary: 'Retrieve a specific review run and its findings',
      description:
        'Enforces `requireReviewRunAccess`: public simulation runs are readable; private repository runs require session authentication and verified ownership of the underlying GitHub installation.',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Review run UUID',
          schema: schemaToJson(z.string().uuid()),
          example: 'c4a9e1c2-9b88-4c1a-8a1e-4d2e7b110022',
        },
      ],
      responses: {
        '200': jsonResponse(
          'Review run details and findings',
          { $ref: '#/components/schemas/ReviewDetailPayload' }
        ),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/badge/{repoId}': {
    get: {
      tags: ['Dashboard & Reviews'],
      summary: 'Render dynamic SVG security status badge',
      description:
        'Generates a shields-style SVG badge reflecting either preset evaluation metrics (`eval-score`, `powered-by`, `demo`) or the latest non-simulation review run status for a repository UUID or slug.',
      security: [],
      parameters: [
        {
          name: 'repoId',
          in: 'path',
          required: true,
          description: 'Repository UUID, slug (`owner--repo`), or preset (`eval-score`, `powered-by`, `demo`)',
          schema: schemaToJson(BadgeParamsSchema.shape.repoId),
          example: 'eval-score',
        },
        {
          name: 'label',
          in: 'query',
          required: false,
          description: 'Custom left-side badge label',
          schema: { type: 'string', default: 'DevGuard AI' },
        },
        {
          name: 'style',
          in: 'query',
          required: false,
          description: 'Optional preset style override (`eval`, `powered-by`)',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'SVG badge image',
          content: {
            'image/svg+xml': {
              schema: { type: 'string' },
            },
          },
        },
        '400': {
          description: 'Invalid repository identifier parameter',
        },
      },
    },
  },
};
