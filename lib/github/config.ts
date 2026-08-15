/**
 * DevGuard AI - Centralized GitHub App Configuration & Single Source of Truth
 */

export const DEFAULT_GITHUB_APP_SLUG = 'devguard-agent';

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
  const explicitUrl =
    process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ||
    process.env.GITHUB_APP_INSTALL_URL;

  if (explicitUrl) {
    return explicitUrl;
  }

  const slug = getGitHubAppSlug();
  return `https://github.com/apps/${slug}/installations/new`;
}
