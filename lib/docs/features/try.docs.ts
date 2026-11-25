import { z } from 'zod';
import { body, jsonResponse, schemaToJson } from '../helpers';
import { TryApiSchema } from '@/lib/validation/schemas';

export const trySchemas = {
  TryRequest: schemaToJson(TryApiSchema),
  TryResponse: {
    type: 'object',
    required: ['success', 'reviewRunId', 'shareUrl', 'status', 'toolCallsCount', 'trace', 'summary', 'findings', 'providerUsed'],
    properties: {
      success: { type: 'boolean' },
      reviewRunId: { type: 'string', format: 'uuid' },
      shareUrl: { type: 'string' },
      status: { type: 'string', enum: ['completed', 'failed', 'running'] },
      toolCallsCount: { type: 'integer' },
      trace: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            step: { type: 'integer' },
            tool: { type: 'string' },
            input: { type: 'object', additionalProperties: true },
            output: { type: 'object', additionalProperties: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
      summary: { type: 'string' },
      findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
      providerUsed: { type: 'string' },
    },
  },
};

export const tryPaths = {
  '/api/try': {
    post: {
      tags: ['Interactive Playground'],
      summary: 'Run an interactive PR security review (JSON or SSE stream)',
      description:
        'Public sandbox endpoint for trying DevGuard AI on sample diffs or pasted code (up to 100KB, max 25 files). Enforces IP-based sliding-window rate limiting (5 requests per 10 minutes) and global LLM budget circuit breaking. Supports `Accept: text/event-stream` for live step streaming.',
      security: [],
      requestBody: body(
        TryApiSchema,
        {
          prTitle: 'feat: payment checkout endpoint refactor',
          prAuthor: 'visitor',
          inputType: 'sample',
          fileNames: ['app/api/checkout/route.ts', 'package.json'],
          diff: "--- a/app/api/checkout/route.ts\n+++ b/app/api/checkout/route.ts\n@@ -34,6 +34,8 @@\n+  const user = await db.raw(\"SELECT * FROM users WHERE id = '\" + userId + \"'\");",
        },
        'Diff or code snippet payload validated by TryApiSchema'
      ),
      responses: {
        '200': jsonResponse(
          'Completed security review analysis (or SSE stream when Accept: text/event-stream)',
          { $ref: '#/components/schemas/TryResponse' },
          {
            success: true,
            reviewRunId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
            shareUrl: '/try/result/d290f1ee-6c54-4b01-90e6-d701748f0851',
            status: 'completed',
            toolCallsCount: 2,
            trace: [],
            summary: 'Detected 1 critical SQL injection pattern in app/api/checkout/route.ts.',
            findings: [],
            providerUsed: 'Groq (Llama 3.3 70B)',
          }
        ),
        '400': { $ref: '#/components/responses/ValidationError' },
        '429': { $ref: '#/components/responses/TooManyRequests' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/try/history': {
    get: {
      tags: ['Interactive Playground'],
      summary: 'List recent playground runs for a browser session',
      description: 'Returns up to 30 recent interactive playground runs associated with the supplied `sessionId` query parameter.',
      security: [],
      parameters: [
        {
          name: 'sessionId',
          in: 'query',
          required: false,
          description: 'Client-generated playground session identifier',
          schema: schemaToJson(z.string().max(128)),
          example: 'sess_9f8a7b6c5d4e',
        },
      ],
      responses: {
        '200': jsonResponse('List of playground runs', {
          type: 'object',
          properties: {
            runs: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        }),
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/try/result/{id}': {
    get: {
      tags: ['Interactive Playground'],
      summary: 'Retrieve a shared playground result by UUID',
      description:
        'Fetches a persisted `/try` result by UUID. Enforces a 30-day retention window and sets `X-Robots-Tag: noindex, nofollow`.',
      security: [],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'TryRun UUID',
          schema: schemaToJson(z.string().uuid()),
          example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        },
      ],
      responses: {
        '200': jsonResponse('Shared playground result', {
          type: 'object',
          properties: {
            run: { type: 'object', additionalProperties: true },
          },
        }),
        '404': { $ref: '#/components/responses/NotFound' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
  '/api/simulate-review': {
    post: {
      tags: ['Interactive Playground'],
      summary: 'Run legacy hardened PR simulation',
      description:
        'Executes the agentic orchestrator on a sample or submitted diff with IP rate limiting (5 req / 10 min) and strict `TryApiSchema` validation.',
      security: [],
      requestBody: body(TryApiSchema, {
        prTitle: 'feat: checkout simulation',
        fileNames: ['app/api/checkout/route.ts'],
      }),
      responses: {
        '200': jsonResponse('Simulation run result', {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            run: { $ref: '#/components/schemas/ReviewRun' },
            findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
          },
        }),
        '400': { $ref: '#/components/responses/ValidationError' },
        '429': { $ref: '#/components/responses/TooManyRequests' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    },
  },
};
