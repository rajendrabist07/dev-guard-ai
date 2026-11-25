import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from '@/lib/docs/openapi';

describe('Modular OpenAPI 3.1.0 Specification (lib/docs/openapi.ts)', () => {
  const doc = buildOpenApiDocument('https://devguard.example.com');

  it('exports a valid OpenAPI 3.1.0 header and server metadata', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toContain('DevGuard AI');
    expect(doc.servers.length).toBeGreaterThanOrEqual(1);
    expect(doc.components.securitySchemes).toHaveProperty('cookieAuth');
    expect(doc.components.securitySchemes).toHaveProperty('bearerAuth');
    expect(doc.components.securitySchemes).toHaveProperty('githubWebhookHmac');
    expect(doc.components.securitySchemes).toHaveProperty('qstashSignature');
  });

  it('documents all 17 core API endpoints without hallucinated paths', () => {
    const expectedPaths = [
      '/api/auth/me',
      '/api/auth/signout',
      '/api/dashboard',
      '/api/reviews/{id}',
      '/api/badge/{repoId}',
      '/api/try',
      '/api/try/history',
      '/api/try/result/{id}',
      '/api/simulate-review',
      '/api/webhooks/github',
      '/api/ingest',
      '/api/jobs/review-worker',
      '/api/jobs/dead-letter',
      '/api/health',
      '/api/observability',
      '/api/cron/watchdog',
      '/api/cron/retention',
    ];

    for (const p of expectedPaths) {
      expect(doc.paths).toHaveProperty(p);
    }
  });

  it('ensures every operation declares tags, summary, security, and responses', () => {
    for (const [pathKey, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods as Record<string, Record<string, unknown>>)) {
        expect(op.tags, `${method.toUpperCase()} ${pathKey} missing tags`).toBeDefined();
        expect(op.summary, `${method.toUpperCase()} ${pathKey} missing summary`).toBeTruthy();
        expect(op.security, `${method.toUpperCase()} ${pathKey} missing security declaration`).toBeDefined();
        expect(op.responses, `${method.toUpperCase()} ${pathKey} missing responses`).toBeDefined();
      }
    }
  });
});
