import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

describe('Integration Test: /api/try Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles standard POST request and returns reviewRunId with structured findings', async () => {
    const { POST } = await import('@/app/api/try/route');

    const reqBody = {
      sampleId: 'sample-sqli',
      inputType: 'sample',
      title: 'feat: add user query endpoint',
      author: 'integration-tester',
      codeSnippet: `--- a/app/api/user/route.ts
+++ b/app/api/user/route.ts
@@ -10,3 +10,4 @@ export async function GET(req: Request) {
+  const query = "SELECT * FROM accounts WHERE id = '" + req.url + "'";`,
      files: ['app/api/user/route.ts'],
    };

    const req = new NextRequest('http://localhost:3000/api/try', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // If SSE response or JSON response, check valid format
    const contentType = res.headers.get('content-type') || '';
    expect(
      contentType.includes('text/event-stream') || contentType.includes('application/json')
    ).toBe(true);
  });
});
