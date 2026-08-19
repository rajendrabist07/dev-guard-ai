import { describe, it, expect } from 'vitest';

describe('Health Check API Endpoint (/api/health)', () => {
  it('returns real-time system status and service health checks', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.services).toBeDefined();
    expect(data.services.supabase).toBeDefined();
    expect(data.services.githubApp).toBeDefined();
    expect(data.services.aiProviders).toBeDefined();
    expect(data.services.aiProviders.groq).toBeDefined();
    expect(data.services.aiProviders.gemini).toBeDefined();
  });
});
