// ============================================================================
// Supabase Target
// ============================================================================
//
// Resolves which local Supabase stack a Node script talks to, and refuses when
// that is another worktree's stack.

import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { repoRoot } from '@euanmsm/devkit-core';
import { loadWtConfig } from '../config.mjs';
import { OVERRIDE_DIR } from './project.mjs';

const DEFAULT_API_PORT = 54321;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::1']);
/** Set to any value to turn a cross-stack refusal into a warning. */
export const BYPASS_VAR = 'SUPABASE_ALLOW_CROSS_WORKTREE';

// ============================================================================
// Reading
// ============================================================================

/**
 * Reads the first of several keys an env file defines.
 *
 * @param path - Absolute path to a `.env`-style file, which may be missing
 * @param keys - Key names to try, in order
 * @returns The value and the key supplying it, or null
 */
function readEnvFile(path, keys) {
  if (!existsSync(path)) return null;

  const contents = readFileSync(path, 'utf8');

  for (const key of keys) {
    const match = contents.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (!match) continue;

    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (value) return { value, key };
  }

  return null;
}

/**
 * Reads a variable from the real environment, treating blank as absent.
 *
 * @param key - The variable's name
 * @returns The trimmed value, or null
 */
function readProcessEnv(key) {
  const value = process.env[key]?.trim();
  return value || null;
}

/**
 * Loads the tree's `supabase` block, tolerating a tree with no wt config.
 *
 * @param root - The checkout's root
 * @returns The block, or null
 */
function supabaseConfig(root) {
  try {
    return loadWtConfig(root).supabase;
  } catch {
    return null;
  }
}

/**
 * Finds the `config.toml` this tree's Supabase CLI reads.
 *
 * @param root - The checkout's root
 * @param dir - The tracked supabase folder, relative to the root
 * @returns Its path, or null
 */
function configPath(root, dir) {
  const override = resolve(root, OVERRIDE_DIR, 'supabase', 'config.toml');
  if (existsSync(override)) return override;

  const tracked = resolve(root, dir, 'config.toml');
  return existsSync(tracked) ? tracked : null;
}

/**
 * Reads `port` from the `[api]` table.
 *
 * @param path - A `config.toml` path
 * @returns The pinned port, or null when the table omits it
 */
function readApiPort(path) {
  let inApi = false;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      inApi = trimmed === '[api]';
      continue;
    }
    if (!inApi) continue;

    const match = trimmed.match(/^port\s*=\s*(\d+)/);
    if (match) return Number(match[1]);
  }

  return null;
}

/**
 * Reads the first `project_id`, ignoring any under `[remotes.*]`.
 *
 * @param path - A `config.toml` path
 * @returns The project id, or null
 */
function readProjectId(path) {
  const match = readFileSync(path, 'utf8').match(
    /^project_id\s*=\s*"([^"]+)"/m,
  );
  return match ? match[1] : null;
}

/**
 * Parses a URL without throwing.
 *
 * @param raw - Any string
 * @returns The URL, or null when malformed
 */
function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Reads a URL's port, or its protocol's default.
 *
 * @param url - A parsed URL
 * @returns The port number
 */
function portOf(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * True for a stack on this machine.
 *
 * @param url - A parsed URL
 * @returns Whether its host is a loopback name
 */
function isLocal(url) {
  return LOCAL_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ''));
}

/**
 * Shows a path relative to the tree where it sits inside it.
 *
 * @param root - The checkout's root
 * @param path - Any absolute path
 * @returns The path to print
 */
function describePath(root, path) {
  const rel = relative(root, path);
  return rel.startsWith('..') ? path : rel;
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolves the Supabase target for a tree without enforcing it.
 *
 * @param opts - `root` of the tree and `envFiles` read before the configured ones
 * @returns The target and where each half of it came from
 */
export function resolveSupabaseTarget(opts = {}) {
  const root = opts.root ?? repoRoot();
  const sb = supabaseConfig(root);
  const config = configPath(root, sb?.dir ?? 'supabase');

  const expectedPort =
    (config ? readApiPort(config) : null) ?? DEFAULT_API_PORT;
  const expectedUrl = `http://127.0.0.1:${expectedPort}`;
  const projectId = config ? readProjectId(config) : null;

  const files = [
    ...(opts.envFiles ?? []),
    ...(sb?.envFiles ?? []).map((f) => resolve(root, f)),
  ];

  let url = readProcessEnv('SUPABASE_URL');
  let urlSource = 'SUPABASE_URL';

  if (!url) {
    url = readProcessEnv('NEXT_PUBLIC_SUPABASE_URL');
    urlSource = 'NEXT_PUBLIC_SUPABASE_URL';
  }

  if (!url) {
    for (const file of files) {
      const hit = readEnvFile(file, [
        'SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
      ]);
      if (hit) {
        url = hit.value;
        urlSource = `${hit.key} in ${describePath(root, file)}`;
        break;
      }
    }
  }

  if (!url) {
    url = expectedUrl;
    urlSource = config
      ? `[api] port in ${describePath(root, config)}`
      : 'built-in default';
  }

  let key = readProcessEnv('SUPABASE_SERVICE_ROLE_KEY');
  let keySource = 'SUPABASE_SERVICE_ROLE_KEY';

  if (!key) {
    for (const file of files) {
      const hit = readEnvFile(file, ['SUPABASE_SERVICE_ROLE_KEY']);
      if (hit) {
        key = hit.value;
        keySource = `${hit.key} in ${describePath(root, file)}`;
        break;
      }
    }
  }

  return {
    url,
    urlSource,
    serviceRoleKey: key ?? '',
    keySource: key ? keySource : 'unresolved',
    root,
    projectId,
    expectedUrl,
    envFiles: files,
  };
}

/**
 * Describes why a target is the wrong stack, never flagging a remote one.
 *
 * @param target - A resolved target
 * @returns The problem, or null when the target is fine
 */
export function findTargetMismatch(target) {
  const url = parseUrl(target.url);

  if (!url) {
    return `Supabase URL is not a valid URL: "${target.url}" (from ${target.urlSource})`;
  }
  if (!isLocal(url)) return null;

  const expected = parseUrl(target.expectedUrl);
  if (!expected || portOf(url) === portOf(expected)) return null;

  const stack = target.projectId ? ` (${target.projectId})` : '';

  return [
    "Supabase target is not this tree's stack.",
    '',
    `  tree:      ${target.root}${stack}`,
    `  expected:  ${target.expectedUrl}`,
    `  resolved:  ${target.url}`,
    `  from:      ${target.urlSource}`,
  ].join('\n');
}

/**
 * Builds the message a refused caller sees.
 *
 * @param mismatch - The problem
 * @returns The problem followed by what to do about it
 */
export function refusal(mismatch) {
  return `${mismatch}\n\nRefusing to run. Fix the source above, or set ${BYPASS_VAR}=1 to override.`;
}

/**
 * Builds the warning shown when the bypass is set.
 *
 * @param mismatch - The problem
 * @returns The problem followed by a note that the run continues
 */
export function bypassWarning(mismatch) {
  return `⚠ ${mismatch}\n\nContinuing anyway — ${BYPASS_VAR} is set.`;
}

/**
 * True when the bypass variable is set.
 *
 * @returns Whether a mismatch warns instead of throwing
 */
export function bypassed() {
  return readProcessEnv(BYPASS_VAR) !== null;
}

let cached = null;

/**
 * Resolves the target once per process and refuses another tree's stack.
 *
 * @param opts - `root` of the tree and `envFiles` read before the configured ones
 * @returns The target
 * @throws When the target is a local stack belonging to another tree
 */
export function requireSupabaseTarget(opts = {}) {
  if (cached) return cached;

  const target = resolveSupabaseTarget(opts);
  const mismatch = findTargetMismatch(target);

  if (mismatch) {
    if (!bypassed()) throw new Error(refusal(mismatch));
    console.warn(bypassWarning(mismatch));
  }

  cached = target;
  return target;
}

/**
 * Returns the service-role key, for a caller about to write.
 *
 * @param opts - `root` of the tree and `envFiles` read before the configured ones
 * @returns The key
 * @throws When the target is refused or no key resolved
 */
export function requireServiceRoleKey(opts = {}) {
  const target = requireSupabaseTarget(opts);

  if (!target.serviceRoleKey) {
    const where = target.envFiles[0]
      ? ` or ${describePath(target.root, target.envFiles[0])}`
      : '';
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY missing. Set it in the environment${where}.`,
    );
  }

  return target.serviceRoleKey;
}

/** Clears the per-process cache, for tests. */
export function resetSupabaseTargetCache() {
  cached = null;
}
