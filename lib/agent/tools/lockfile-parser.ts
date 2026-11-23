/**
 * Lockfile parser for exact resolved dependency extraction at PR head SHA.
 * Supports:
 * - npm `package-lock.json` (v1, v2, v3 formats including monorepo workspaces)
 * - yarn `yarn.lock` (v1 Classic and v2+ Berry formats)
 * - pnpm `pnpm-lock.yaml` (v5, v6, v9 formats)
 */

export interface ResolvedPackageInfo {
  name: string;
  version: string;
  dependencyPath?: string[];
  isWorkspace?: boolean;
}

export interface DependencyResolution {
  name: string;
  declaredVersion: string;
  resolvedVersion: string;
  isResolvedFromLockfile: boolean;
  dependencyPath?: string[];
  isPrChange?: boolean;
}

export function cleanVersionRange(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^npm:[^@]+@/, '');
  cleaned = cleaned.replace(/^[\^~><=\sv]+/, '');
  const semverMatch = cleaned.match(/^\d+(\.\d+)?(\.\d+)?([a-zA-Z0-9\.\-_]*)/);
  return semverMatch ? semverMatch[0] : cleaned;
}

/**
 * Parses `package-lock.json` content (v1, v2, v3 formats).
 */
export function parsePackageLockJson(content: string): Map<string, ResolvedPackageInfo> {
  const map = new Map<string, ResolvedPackageInfo>();
  try {
    const parsed = JSON.parse(content);

    // Lockfile v2 & v3: `packages` dictionary
    if (parsed.packages && typeof parsed.packages === 'object') {
      for (const [pkgPath, pkgInfo] of Object.entries(parsed.packages)) {
        if (!pkgPath || pkgPath === '') continue; // skip root
        if (!pkgInfo || typeof pkgInfo !== 'object') continue;

        const info = pkgInfo as { version?: string; dependencies?: Record<string, string> };
        if (!info.version) continue;

        // Path formats: "node_modules/axios" or "packages/app/node_modules/lodash"
        const segments = pkgPath.split('node_modules/');
        const pkgName = segments[segments.length - 1];

        if (pkgName) {
          const isWorkspace = pkgPath.startsWith('packages/') || pkgPath.startsWith('apps/');
          const pathSegments = segments.filter(Boolean).map((s) => s.replace(/\/$/, ''));

          if (!map.has(pkgName)) {
            map.set(pkgName, {
              name: pkgName,
              version: info.version,
              dependencyPath: pathSegments.length > 1 ? pathSegments : [pkgName],
              isWorkspace,
            });
          }
        }
      }
    }

    // Lockfile v1 or v2 fallback: `dependencies` tree
    if (parsed.dependencies && typeof parsed.dependencies === 'object') {
      const traverseDependencies = (deps: Record<string, unknown>, currentPath: string[] = []) => {
        for (const [name, rawInfo] of Object.entries(deps)) {
          if (!rawInfo || typeof rawInfo !== 'object') continue;
          const info = rawInfo as { version?: string; dependencies?: Record<string, unknown> };
          if (info.version && !map.has(name)) {
            map.set(name, {
              name,
              version: info.version,
              dependencyPath: [...currentPath, name],
            });
          }
          if (info.dependencies && typeof info.dependencies === 'object') {
            traverseDependencies(info.dependencies, [...currentPath, name]);
          }
        }
      };

      traverseDependencies(parsed.dependencies);
    }
  } catch {
    // Malformed package-lock.json
  }

  return map;
}

/**
 * Parses `yarn.lock` content (v1 and v2+ Berry formats).
 */
export function parseYarnLock(content: string): Map<string, ResolvedPackageInfo> {
  const map = new Map<string, ResolvedPackageInfo>();
  if (!content) return map;

  // Regex matching block header followed by `version "..."` or `version: ...`
  // e.g.: "axios@^0.19.0":\n  version "0.19.0"
  // e.g.: "axios@npm:^0.19.0":\n  version: 0.19.0
  const blockRegex = /^(?:"?(@?[a-zA-Z0-9_\-\.\/]+)@[^\n:]+"?):\s*\n(?:[ ]+[^\n]+\n)*?[ ]+version[:\s]+"??([a-zA-Z0-9_\-\.\+]+)"??/gm;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(content)) !== null) {
    const pkgName = match[1];
    const version = match[2];
    if (pkgName && version && !map.has(pkgName)) {
      map.set(pkgName, {
        name: pkgName,
        version,
        dependencyPath: [pkgName],
      });
    }
  }

  return map;
}

/**
 * Parses `pnpm-lock.yaml` content.
 */
export function parsePnpmLock(content: string): Map<string, ResolvedPackageInfo> {
  const map = new Map<string, ResolvedPackageInfo>();
  if (!content) return map;

  // e.g. /axios@0.19.0: or /@scope/pkg@1.0.0: or /axios/0.19.0:
  const pnpmRegex = /(?:^\s*\/|^\s*["']?)(@?[a-zA-Z0-9_\-\.\/]+)(?:@|\/)([0-9][a-zA-Z0-9_\-\.\+]*)(?:["']?:\s*$|\()/gm;

  let match: RegExpExecArray | null;
  while ((match = pnpmRegex.exec(content)) !== null) {
    const pkgName = match[1];
    const version = match[2];
    if (pkgName && version && !map.has(pkgName)) {
      map.set(pkgName, {
        name: pkgName,
        version,
        dependencyPath: [pkgName],
      });
    }
  }

  return map;
}

/**
 * Automatically identifies lockfile format and builds index of resolved packages.
 */
export function parseLockfile(
  content: string,
  filename?: string
): Map<string, ResolvedPackageInfo> {
  if (!content || !content.trim()) {
    return new Map();
  }

  const fname = filename?.toLowerCase() || '';

  if (fname.includes('yarn') || content.includes('# yarn lockfile')) {
    return parseYarnLock(content);
  }

  if (fname.includes('pnpm') || content.includes('lockfileVersion:')) {
    return parsePnpmLock(content);
  }

  // Default to package-lock.json
  const npmMap = parsePackageLockJson(content);
  if (npmMap.size > 0) return npmMap;

  // If npm parsing returned empty, attempt yarn and pnpm
  const yarnMap = parseYarnLock(content);
  if (yarnMap.size > 0) return yarnMap;

  return parsePnpmLock(content);
}

/**
 * Resolves exact package versions for declared dependencies using lockfile data.
 * Falls back to cleaned semver strings if lockfile resolution is unavailable.
 */
export function resolveExactDependencies(
  manifestDeps: Array<{ name: string; declaredVersion: string; isPrChange?: boolean }>,
  lockfileContent?: string,
  lockfileFilename?: string
): DependencyResolution[] {
  const lockfileMap = lockfileContent ? parseLockfile(lockfileContent, lockfileFilename) : new Map();

  return manifestDeps.map((dep) => {
    const lockEntry = lockfileMap.get(dep.name);

    if (lockEntry && lockEntry.version) {
      return {
        name: dep.name,
        declaredVersion: dep.declaredVersion,
        resolvedVersion: lockEntry.version,
        isResolvedFromLockfile: true,
        dependencyPath: lockEntry.dependencyPath,
        isPrChange: dep.isPrChange ?? true,
      };
    }

    return {
      name: dep.name,
      declaredVersion: dep.declaredVersion,
      resolvedVersion: cleanVersionRange(dep.declaredVersion),
      isResolvedFromLockfile: false,
      dependencyPath: [dep.name],
      isPrChange: dep.isPrChange ?? true,
    };
  });
}
