import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueueReviewJob, verifyQStashSignature, ReviewJobPayload } from '@/lib/queue/qstash';

const mockPublishJSON = vi.fn();
const mockVerify = vi.fn();

vi.mock('@upstash/qstash', () => {
  return {
    Client: vi.fn().mockImplementation(function () {
      return { publishJSON: mockPublishJSON };
    }),
    Receiver: vi.fn().mockImplementation(function () {
      return { verify: mockVerify };
    }),
  };
});

const mockExecuteReviewJob = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/jobs/review-pipeline', () => ({
  executeReviewJob: (...args: any[]) => mockExecuteReviewJob(...args),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('lib/queue/qstash.ts', () => {
  const originalEnv = { ...process.env };

  const samplePayload: ReviewJobPayload = {
    reviewRunId: 'run-q-100',
    installationId: 1234,
    repoFullName: 'org/repo',
    prNumber: 10,
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    prTitle: 'Add authentication',
    prAuthor: 'devuser',
    correlationId: 'corr-q-123',
    attempt: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QSTASH_TOKEN;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('enqueueReviewJob', () => {
    it('falls back to direct worker execution when QSTASH_TOKEN is not configured', async () => {
      const result = await enqueueReviewJob(samplePayload);

      expect(result.enqueued).toBe(true);
      expect(result.provider).toBe('direct_fallback');

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockExecuteReviewJob).toHaveBeenCalledWith(samplePayload);
    });

    it('logs error if direct execution fallback throws an exception', async () => {
      mockExecuteReviewJob.mockRejectedValueOnce(new Error('Async worker boom'));

      const result = await enqueueReviewJob(samplePayload);

      expect(result.enqueued).toBe(true);
      expect(result.provider).toBe('direct_fallback');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('publishes to Upstash QStash when QSTASH_TOKEN is configured', async () => {
      process.env.QSTASH_TOKEN = 'qstash-test-token';
      process.env.APP_BASE_URL = 'https://devguard.example.com';

      mockPublishJSON.mockResolvedValueOnce({ messageId: 'msg-qstash-999' });

      const result = await enqueueReviewJob(samplePayload);

      expect(result.enqueued).toBe(true);
      expect(result.provider).toBe('qstash');
      expect(result.messageId).toBe('msg-qstash-999');

      expect(mockPublishJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://devguard.example.com/api/jobs/review-worker',
          body: samplePayload,
          retries: 3,
          callback: 'https://devguard.example.com/api/jobs/dead-letter',
          headers: expect.objectContaining({
            'x-correlation-id': 'corr-q-123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('uses VERCEL_URL if APP_BASE_URL is not set', async () => {
      process.env.QSTASH_TOKEN = 'qstash-test-token';
      process.env.VERCEL_URL = 'devguard-preview.vercel.app';

      mockPublishJSON.mockResolvedValueOnce({ messageId: 'msg-qstash-123' });

      const result = await enqueueReviewJob(samplePayload);

      expect(result.enqueued).toBe(true);
      expect(mockPublishJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://devguard-preview.vercel.app/api/jobs/review-worker',
        })
      );
    });

    it('falls back to direct execution when QStash publishJSON throws', async () => {
      process.env.QSTASH_TOKEN = 'qstash-test-token';
      mockPublishJSON.mockRejectedValueOnce(new Error('QStash network failure'));

      const result = await enqueueReviewJob(samplePayload);

      expect(result.enqueued).toBe(true);
      expect(result.provider).toBe('direct_fallback');

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockExecuteReviewJob).toHaveBeenCalledWith(samplePayload);
    });
  });

  describe('verifyQStashSignature', () => {
    it('returns true when signing keys are absent in non-production environment', async () => {
      (process.env as any).NODE_ENV = 'test';
      const valid = await verifyQStashSignature('{"test": true}', null);
      expect(valid).toBe(true);
    });

    it('returns false when signing keys are absent in production environment', async () => {
      (process.env as any).NODE_ENV = 'production';
      const valid = await verifyQStashSignature('{"test": true}', null);
      expect(valid).toBe(false);
    });

    it('returns false if signatureHeader is null when keys are set', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'sig-key-current';
      const valid = await verifyQStashSignature('{"test": true}', null);
      expect(valid).toBe(false);
    });

    it('returns true when Receiver verifies valid signature', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'sig-key-current';
      process.env.QSTASH_NEXT_SIGNING_KEY = 'sig-key-next';

      mockVerify.mockResolvedValueOnce(true);

      const valid = await verifyQStashSignature('{"test": true}', 'valid-sig-header');
      expect(valid).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith({
        body: '{"test": true}',
        signature: 'valid-sig-header',
      });
    });

    it('returns false when Receiver throws an invalid signature error', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'sig-key-current';

      mockVerify.mockRejectedValueOnce(new Error('Signature mismatch'));

      const valid = await verifyQStashSignature('{"test": true}', 'invalid-sig-header');
      expect(valid).toBe(false);
    });
  });
});

