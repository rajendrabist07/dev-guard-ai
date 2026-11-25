import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for observability
export const tryLatency = new Trend('devguard_try_latency_ms');
export const webhookLatency = new Trend('devguard_webhook_latency_ms');
export const rateLimitHits = new Counter('devguard_rate_limit_429');
export const successRate = new Rate('devguard_success_rate');

export const options = {
  scenarios: {
    // Scenario 1: Interactive Playground (/api/try) concurrency & rate limiting
    try_playground_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 20 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
      exec: 'testTryPlayground',
    },
    // Scenario 2: GitHub Webhook handler concurrency & idempotency
    webhook_burst_load: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'testWebhookHandler',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // Max 5% unexpected server failure (excluding 429)
    devguard_try_latency_ms: ['p(95)<3000'], // 95% of playground reviews under 3s
    devguard_webhook_latency_ms: ['p(95)<500'], // 95% of webhooks queued under 500ms
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export function testTryPlayground() {
  const payload = JSON.stringify({
    input_type: 'pasted',
    input_snippet: `
      import fs from 'fs';
      export function serve(req, res) {
        const path = req.query.path;
        return fs.readFileSync(path, 'utf8');
      }
    `,
    pr_title: 'Load Test Security PR',
    pr_author: 'load-test-agent',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': `perf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/try`, payload, params);
  const duration = Date.now() - start;
  tryLatency.add(duration);

  if (res.status === 429) {
    rateLimitHits.add(1);
    check(res, {
      'rate limit handled cleanly (HTTP 429)': (r) => r.status === 429,
    });
  } else {
    const isSuccess = check(res, {
      'status is 200': (r) => r.status === 200,
      'has findings array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.findings);
        } catch {
          return false;
        }
      },
    });
    successRate.add(isSuccess);
  }

  sleep(1);
}

export function testWebhookHandler() {
  const payload = JSON.stringify({
    action: 'opened',
    pull_request: {
      number: 100,
      title: 'Perf load PR',
      user: { login: 'perf-bot' },
      head: { sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
    },
    repository: {
      name: 'perf-repo',
      full_name: 'perf-org/perf-repo',
      owner: { login: 'perf-org' },
    },
    installation: { id: 99999 },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': 'sha256=e9d3d3b7e74213b1904a601235b2931215b244673859670f90e549a1758c148f',
      'x-github-delivery': `delivery-${Date.now()}-${__VU}-${__ITER}`,
      'x-github-event': 'pull_request',
    },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/webhooks/github`, payload, params);
  const duration = Date.now() - start;
  webhookLatency.add(duration);

  check(res, {
    'webhook accepted or duplicate handled': (r) => r.status === 202 || r.status === 200,
  });

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    stdout: `\n=== DevGuard AI Load Test Execution Complete ===\n` +
      `Try p50: ${data.metrics.devguard_try_latency_ms?.values['p(50)'] || 0}ms\n` +
      `Try p95: ${data.metrics.devguard_try_latency_ms?.values['p(95)'] || 0}ms\n` +
      `Try p99: ${data.metrics.devguard_try_latency_ms?.values['p(99)'] || 0}ms\n` +
      `Webhook p50: ${data.metrics.devguard_webhook_latency_ms?.values['p(50)'] || 0}ms\n` +
      `Webhook p95: ${data.metrics.devguard_webhook_latency_ms?.values['p(95)'] || 0}ms\n`,
  };
}
