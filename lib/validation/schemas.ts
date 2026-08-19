import { z } from 'zod';

export const TryApiSchema = z.object({
  prTitle: z.string().trim().max(200).optional(),
  prAuthor: z.string().trim().max(100).optional(),
  diff: z.string().max(100000, 'Diff/code snippet exceeds 100KB limit').optional(),
  fileNames: z.array(z.string().trim().max(255)).max(20, 'Maximum 20 files per review').optional(),
  sessionId: z.string().trim().max(128).optional(),
  inputType: z.enum(['sample', 'pasted']).optional(),
  sampleId: z.string().trim().max(64).optional(),
  codeSnippet: z.string().max(100000).optional(),
  files: z.array(z.string().trim().max(255)).max(20).optional(),
});

export const GitHubWebhookHeadersSchema = z.object({
  'x-hub-signature-256': z.string().min(1, 'Missing GitHub webhook signature header'),
  'x-github-event': z.string().min(1, 'Missing GitHub event header'),
});

export const BadgeParamsSchema = z.object({
  repoId: z.string().trim().min(1).max(128),
});
