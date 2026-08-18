/**
 * DevGuard AI - Centralized GitHub App Configuration & Single Source of Truth
 */

export const DEFAULT_GITHUB_APP_SLUG = 'devguard-agent';
export const CANONICAL_GITHUB_APP_INSTALL_URL = `https://github.com/apps/${DEFAULT_GITHUB_APP_SLUG}/installations/new`;

export const NEXT_PUBLIC_GITHUB_APP_INSTALL_URL =
  process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ||
  process.env.GITHUB_APP_INSTALL_URL ||
  CANONICAL_GITHUB_APP_INSTALL_URL;

/**
 * Returns the configured GitHub App slug from environment variables,
 * or falls back to the default slug.
 */
export function getGitHubAppSlug(): string {
  return (
    process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ||
    process.env.GITHUB_APP_SLUG ||
    DEFAULT_GITHUB_APP_SLUG
  );
}

/**
 * Returns the ONE canonical GitHub App installation URL:
 * https://github.com/apps/{app-slug}/installations/new
 *
 * This direct consent URL allows users to install DevGuard AI onto their repositories.
 * Works consistently across both Client Components and Server Components.
 */
export function getGitHubAppInstallUrl(): string {
  return (
    process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ||
    process.env.GITHUB_APP_INSTALL_URL ||
    `https://github.com/apps/${getGitHubAppSlug()}/installations/new`
  );
}
