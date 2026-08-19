import { describe, it, expect, vi, afterEach } from 'vitest';
import { scanDependencies } from '@/lib/agent/tools/deps-scan';

describe('Dependency Vulnerability Scanner (lib/agent/tools/deps-scan.ts)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('detects known SSRF CVE in legacy Axios versions', async () => {
    const packageJson = JSON.stringify({
      dependencies: {
        axios: '0.19.0',
      },
    });

    const result = await scanDependencies(packageJson);
    const vuln = result.vulnerabilities.find((v) => v.package === 'axios');
    expect(vuln).toBeDefined();
    expect(vuln?.vulnerabilityId).toBe('GHSA-4w2v-q235-vp99');
    expect(vuln?.severity).toBe('critical');
    expect(vuln?.recommendedVersion).toBe('^1.7.4');
  });

  it('detects Prototype Pollution CVE in vulnerable Lodash versions', async () => {
    const packageJson = JSON.stringify({
      dependencies: {
        lodash: '4.17.15',
      },
    });

    const result = await scanDependencies(packageJson);
    const vuln = result.vulnerabilities.find((v) => v.package === 'lodash');
    expect(vuln).toBeDefined();
    expect(vuln?.vulnerabilityId).toBe('CVE-2020-8203');
    expect(vuln?.severity).toBe('warning');
    expect(vuln?.recommendedVersion).toBe('^4.17.21');
  });

  it('handles external OSV API response gracefully when queried', async () => {
    // Mock global.fetch to simulate OSV.dev response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vulns: [
          {
            id: 'GHSA-fake-cve-1234',
            summary: 'Mocked vulnerability from OSV.dev query',
          },
        ],
      }),
    });

    const manifest = JSON.stringify({
      dependencies: {
        express: '4.16.0',
      },
    });

    const result = await scanDependencies(manifest);
    expect(result.totalDependenciesScanned).toBeGreaterThanOrEqual(1);
    expect(result.summary).toBeDefined();
  });

  it('handles OSV API network failure with zero crashes', async () => {
    // Mock network failure / timeout
    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const manifest = JSON.stringify({
      dependencies: {
        express: '4.17.1',
      },
    });

    const result = await scanDependencies(manifest);
    expect(result.success).toBe(true);
    expect(result.vulnerabilities).toBeDefined();
  });

  it('returns clean summary when dependencies are up to date', async () => {
    const manifest = JSON.stringify({
      dependencies: {
        next: '^15.1.0',
        react: '^19.0.0',
      },
    });

    const result = await scanDependencies(manifest);
    const realVulns = result.vulnerabilities.filter((v) => v.vulnerabilityId !== 'NONE');
    expect(realVulns.length).toBe(0);
    expect(result.summary).toContain('0 CVE security advisories');
  });
});
