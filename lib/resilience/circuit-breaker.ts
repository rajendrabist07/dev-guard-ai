import { logger } from '../observability/logger';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

export class CircuitBreakerError extends Error {
  constructor(public readonly breakerName: string) {
    super(`Circuit breaker '${breakerName}' is OPEN. Fast-failing request.`);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  public readonly name: string;
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker '${this.name}' transitioned from OPEN to HALF_OPEN (trial mode).`, {
          module: 'circuit-breaker',
          breaker: this.name,
        });
      }
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new CircuitBreakerError(this.name);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info(`Circuit breaker '${this.name}' trial succeeded. Transitioning to CLOSED.`, {
        module: 'circuit-breaker',
        breaker: this.name,
      });
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  public recordFailure(err?: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker '${this.name}' tripped to OPEN state (${this.failureCount} consecutive failures).`, {
        module: 'circuit-breaker',
        breaker: this.name,
        failureCount: this.failureCount,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

// Singletons for primary outbound providers
export const osvCircuitBreaker = new CircuitBreaker({ name: 'osv-api', failureThreshold: 3, resetTimeoutMs: 20_000 });
export const groqCircuitBreaker = new CircuitBreaker({ name: 'groq-llm', failureThreshold: 4, resetTimeoutMs: 30_000 });
export const geminiCircuitBreaker = new CircuitBreaker({ name: 'gemini-llm', failureThreshold: 4, resetTimeoutMs: 30_000 });
export const githubCircuitBreaker = new CircuitBreaker({ name: 'github-api', failureThreshold: 5, resetTimeoutMs: 30_000 });
export const qstashCircuitBreaker = new CircuitBreaker({ name: 'qstash-queue', failureThreshold: 3, resetTimeoutMs: 15_000 });
