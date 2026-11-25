import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBinaryFile,
  parseDiffModifiedLines,
  getOctokitClient,
  fetchPullRequestDetails,
  fetchPullRequestDiff,
  postGitHubReviewComment,
} from '@/lib/github/client';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('lib/github/client.ts operations and formatting', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isBinaryFile', () => {
    it('accurately identifies binary file extensions', () => {
      expect(isBinaryFile('image.png')).toBe(true);
      expect(isBinaryFile('binary.wasm')).toBe(true);
      expect(isBinaryFile('archive.tar.gz')).toBe(true);
      expect(isBinaryFile('font.woff2')).toBe(true);
      expect(isBinaryFile('bundle.exe')).toBe(true);
    });

    it('returns false for text and code files', () => {
      expect(isBinaryFile('index.ts')).toBe(false);
      expect(isBinaryFile('package.json')).toBe(false);
      expect(isBinaryFile('README.md')).toBe(false);
      expect(isBinaryFile('Dockerfile')).toBe(false);
      expect(isBinaryFile('style.css')).toBe(false);
    });
  });

  describe('parseDiffModifiedLines', () => {
    it('returns an empty map for empty diff string', () => {
      const map = parseDiffModifiedLines('');
      expect(map.size).toBe(0);
    });

    it('extracts modified line numbers from single and multi-hunk diffs', () => {
      const sampleDiff = `--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +15,2 @@
 const a = 1;
 const b = 2;
@@ -40,1 +50,3 @@
 const x = 10;
 const y = 20;
 const z = 30;
--- a/README.md
+++ b/README.md
@@ -1,2 +1,1 @@
 # Title`;

      const map = parseDiffModifiedLines(sampleDiff);
      expect(map.has('src/app.ts')).toBe(true);
      expect(map.has('README.md')).toBe(true);

      const appLines = map.get('src/app.ts')!;
      // First hunk: +15, 2 lines -> 15, 16
      expect(appLines.has(15)).toBe(true);
      expect(appLines.has(16)).toBe(true);
      expect(appLines.has(17)).toBe(false);

      // Second hunk: +50, 3 lines -> 50, 51, 52
      expect(appLines.has(50)).toBe(true);
      expect(appLines.has(51)).toBe(true);
      expect(appLines.has(52)).toBe(true);
      expect(appLines.has(53)).toBe(false);

      // README hunk: +1, 1 line -> 1
      const readmeLines = map.get('README.md')!;
      expect(readmeLines.has(1)).toBe(true);
    });
  });

  describe('getOctokitClient', () => {
    it('creates an Octokit instance with personal access token when App credentials are absent', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
      process.env.GITHUB_TOKEN = 'ghp_dummytoken123';

      const client = await getOctokitClient();
      expect(client).toBeInstanceOf(Octokit);
    });

    it('authenticates with GitHub App installation token when credentials are provided', async () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----';

      const authHandlerMock = vi.fn().mockResolvedValue({
        token: 'ghs_installation_token_abc',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      vi.mocked(createAppAuth).mockReturnValue(authHandlerMock as any);

      const client = await getOctokitClient(98765);
      expect(client).toBeInstanceOf(Octokit);
      expect(createAppAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: '12345',
          installationId: 98765,
        })
      );
    });
  });

  describe('fetchPullRequestDetails and fetchPullRequestDiff', () => {
    it('fetches changed files, filters binaries/deletions, and loads lockfile', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            listFiles: vi.fn().mockResolvedValue({
              data: [
                { filename: 'app.ts', status: 'modified', patch: '+console.log(1);' },
                { filename: 'logo.png', status: 'added', patch: '+binary' },
                { filename: 'deleted.ts', status: 'removed', patch: '-old' },
                { filename: 'package.json', status: 'modified', patch: '+ "axios": "1.0.0"' },
              ],
            }),
          },
          repos: {
            getContent: vi.fn().mockImplementation(async ({ path }: { path: string }) => {
              if (path === 'app.ts') {
                return {
                  data: {
                    content: Buffer.from('console.log(1);').toString('base64'),
                  },
                };
              }
              if (path === 'package-lock.json') {
                return {
                  data: {
                    content: Buffer.from('{"name": "test-pkg"}').toString('base64'),
                  },
                };
              }
              throw new Error('Not found');
            }),
          },
        },
      } as any;

      const details = await fetchPullRequestDetails(
        mockOctokit,
        'test-owner',
        'test-repo',
        42,
        'sha-abc-123'
      );

      expect(details.files).toEqual(['app.ts', 'package.json']);
      expect(details.truncation.isTruncated).toBe(true);
      expect(details.truncation.skippedFilesCount).toBe(2);
      expect(details.fullFiles.get('app.ts')).toBe('console.log(1);');
      expect(details.lockfileFilename).toBe('package-lock.json');
      expect(details.lockfileContent).toBe('{"name": "test-pkg"}');

      // Test wrapper fetchPullRequestDiff
      const diffOnly = await fetchPullRequestDiff(
        mockOctokit,
        'test-owner',
        'test-repo',
        42,
        'sha-abc-123'
      );
      expect(diffOnly.files).toEqual(['app.ts', 'package.json']);
      expect(diffOnly.diff).toContain('--- a/app.ts');
    });

    it('wraps errors when GitHub listFiles fails', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            listFiles: vi.fn().mockRejectedValue(new Error('GitHub 500 server error')),
          },
        },
      } as any;

      await expect(
        fetchPullRequestDetails(mockOctokit, 'owner', 'repo', 1)
      ).rejects.toThrow('Could not fetch PR details for owner/repo#1: GitHub 500 server error');
    });
  });

  describe('postGitHubReviewComment', () => {
    it('posts review with REQUEST_CHANGES for critical findings and classifies inline vs out-of-diff', async () => {
      const createReviewMock = vi.fn().mockResolvedValue({ data: { id: 101 } });
      const mockOctokit = {
        rest: {
          pulls: {
            createReview: createReviewMock,
          },
        },
      } as any;

      const rawDiff = `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,1 +10,2 @@
+const pass = "secret";
`;

      const findings = [
        {
          review_run_id: 'run-1',
          file_path: 'src/auth.ts',
          line: 10,
          message: 'Hardcoded secret token',
          severity: 'critical' as const,
          confidence: 'high' as const,
          tool_source: 'ast_analyzer',
          corroboration_sources: ['ast_analyzer', 'semgrep'],
          suggested_fix: 'const pass = process.env.SECRET;',
        },
        {
          review_run_id: 'run-1',
          file_path: 'src/auth.ts',
          line: 80, // Outside diff hunks!
          message: 'Out of diff line issue',
          severity: 'warning' as const,
          confidence: 'medium' as const,
          tool_source: 'ast_analyzer',
          suggested_fix: null,
        },
        {
          review_run_id: 'run-1',
          file_path: 'src/util.ts',
          line: 5,
          message: 'Heuristic warning',
          severity: 'info' as const,
          confidence: 'low' as const, // Low confidence
          tool_source: 'heuristic',
          suggested_fix: null,
        },
      ];

      const success = await postGitHubReviewComment(
        mockOctokit,
        'owner',
        'repo',
        7,
        'sha-commit-1',
        findings,
        'Review summary text',
        rawDiff,
        { isTruncated: true, analyzedFilesCount: 50, totalFilesCount: 65, skippedFilesCount: 15 },
        'npm test passed'
      );

      expect(success).toBe(true);
      expect(createReviewMock).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          pull_number: 7,
          commit_id: 'sha-commit-1',
          event: 'REQUEST_CHANGES',
          comments: [
            expect.objectContaining({
              path: 'src/auth.ts',
              line: 10,
              body: expect.stringContaining('Corroborated by: ast_analyzer, semgrep'),
            }),
          ],
          body: expect.stringContaining('Review Scope Notice'),
        })
      );

      const reviewBody = createReviewMock.mock.calls[0][0].body;
      expect(reviewBody).toContain('Findings in Surrounding Code (Outside Modified Diff)');
      expect(reviewBody).toContain('Worth a Second Look (Heuristic / Low-Confidence Flags)');
      expect(reviewBody).toContain('Test Suite Status');
    });

    it('returns false and logs error on API exception or rate limit', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            createReview: vi.fn().mockRejectedValue({
              status: 403,
              message: 'You have exceeded a secondary rate limit.',
              response: { headers: { 'retry-after': '60' } },
            }),
          },
        },
      } as any;

      const success = await postGitHubReviewComment(
        mockOctokit,
        'owner',
        'repo',
        7,
        'sha-commit-1',
        [],
        'Summary'
      );

      expect(success).toBe(false);
    });
  });
});
