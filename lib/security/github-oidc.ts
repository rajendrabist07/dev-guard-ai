import crypto from 'crypto';
import { logger } from '@/lib/observability/logger';

export interface GitHubOidcClaims {
  iss: string;
  aud: string;
  repository: string;
  repository_owner: string;
  sha: string;
  ref: string;
  actor: string;
  run_id: string;
  workflow?: string;
  exp: number;
  nbf?: number;
  iat?: number;
}

export interface JwkKey {
  kty: string;
  kid: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

const GITHUB_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const DEFAULT_AUDIENCE = 'devguard-ai';

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches and caches GitHub Actions OIDC JWKS.
 */
export async function getGitHubJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  try {
    const res = await fetch(GITHUB_JWKS_URL, {
      headers: { 'User-Agent': 'DevGuard-AI-OIDC-Verifier' },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch GitHub JWKS: HTTP ${res.status}`);
    }

    const data = (await res.json()) as JwksResponse;
    if (!data.keys || !Array.isArray(data.keys)) {
      throw new Error('Malformed JWKS response from GitHub');
    }

    jwksCache = { keys: data.keys, fetchedAt: now };
    return data.keys;
  } catch (err: unknown) {
    // If cache exists, return stale cache on network failure
    if (jwksCache) {
      logger.warn('Failed to refresh GitHub JWKS, returning stale cached keys', {
        error: err instanceof Error ? err.message : String(err),
      });
      return jwksCache.keys;
    }
    throw err;
  }
}

/**
 * For testing / local verification: inject mock JWKS keys.
 */
export function setMockGitHubJwks(keys: JwkKey[] | null) {
  if (keys === null) {
    jwksCache = null;
  } else {
    jwksCache = { keys, fetchedAt: Date.now() };
  }
}

/**
 * Verifies a GitHub Actions OIDC JWT against GitHub's JWKS and asserts issuer,
 * audience, repository, and commit sha claims.
 */
export async function verifyGitHubOidcToken(
  jwt: string,
  options: {
    expectedAudience?: string;
    expectedRepository?: string;
    expectedSha?: string;
  } = {}
): Promise<GitHubOidcClaims> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: must contain header, payload, and signature.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Decode header
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid JWT header: base64url decode or JSON parse failed.');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported JWT algorithm '${header.alg}', expected 'RS256'.`);
  }

  if (!header.kid) {
    throw new Error('JWT header missing key ID (kid).');
  }

  // 2. Decode payload
  let payload: GitHubOidcClaims;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid JWT payload: base64url decode or JSON parse failed.');
  }

  // 3. Find matching JWK
  const keys = await getGitHubJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`No matching public key found in GitHub JWKS for kid '${header.kid}'.`);
  }

  // 4. Verify cryptographic signature
  const dataToVerify = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(signatureB64, 'base64url');

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey({
      key: {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
      },
      format: 'jwk',
    });
  } catch (err: unknown) {
    throw new Error(`Failed to import public key from JWK: ${err instanceof Error ? err.message : String(err)}`);
  }

  const isValid = crypto.verify('RSA-SHA256', dataToVerify, publicKey, signature);
  if (!isValid) {
    throw new Error('Invalid JWT cryptographic signature.');
  }

  // 5. Verify standard claims
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.iss !== GITHUB_OIDC_ISSUER) {
    throw new Error(`Invalid issuer '${payload.iss}', expected '${GITHUB_OIDC_ISSUER}'.`);
  }

  if (payload.exp && payload.exp < nowSec - 10) { // 10s clock skew tolerance
    throw new Error(`OIDC token expired at ${payload.exp} (current time: ${nowSec}).`);
  }

  if (payload.nbf && payload.nbf > nowSec + 10) {
    throw new Error(`OIDC token not valid before ${payload.nbf} (current time: ${nowSec}).`);
  }

  const expectedAud = options.expectedAudience || process.env.GITHUB_OIDC_AUDIENCE || DEFAULT_AUDIENCE;
  if (payload.aud !== expectedAud) {
    throw new Error(`Invalid audience '${payload.aud}', expected '${expectedAud}'.`);
  }

  if (options.expectedRepository && payload.repository !== options.expectedRepository) {
    throw new Error(`Repository mismatch: token belongs to '${payload.repository}', expected '${options.expectedRepository}'.`);
  }

  if (options.expectedSha && payload.sha !== options.expectedSha) {
    throw new Error(`Commit SHA mismatch: token contains '${payload.sha}', expected '${options.expectedSha}'.`);
  }

  return payload;
}
