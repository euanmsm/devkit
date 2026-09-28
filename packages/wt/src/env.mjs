// ============================================================================
// Env Files
// ============================================================================
//
// Copies the main checkout's untracked env files into a new worktree and points
// every port inside them at the worktree's own lane.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { trackedFiles } from './git.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * Turns a file-name pattern holding `*` and `?` into a regex.
 *
 * @param pattern - A pattern such as `.env*`
 * @returns A regex matching whole file names
 */
export function globToRegex(pattern) {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${body}$`);
}

/**
 * Lists a checkout's untracked files matching the env patterns.
 *
 * @param root - The checkout's root
 * @param env - The config's `env` block
 * @returns Repo-relative paths, nearest first
 */
export function envFiles(root, env) {
  const patterns = env.copy.map(globToRegex);
  const tracked = trackedFiles(root);
  const found = [];

  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (depth < env.maxDepth && !SKIP_DIRS.has(entry.name)) {
          walk(path, depth + 1);
        }
      } else if (patterns.some((re) => re.test(entry.name))) {
        const rel = relative(root, path);
        if (!tracked.has(rel) && (!entry.isSymbolicLink() || isFile(path))) {
          found.push(rel);
        }
      }
    }
  };

  walk(root, 1);
  return found;
}

/**
 * True when a path leads to a regular file, following symlinks.
 *
 * @param path - Any path
 * @returns Whether it resolves to a file
 */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Copies the listed files from one checkout into another, warning on any that fail.
 *
 * @param from - The source checkout's root
 * @param to - The target checkout's root
 * @param files - Repo-relative paths to copy
 * @returns The paths copied
 */
export function copyFiles(from, to, files) {
  const copied = [];

  for (const rel of files) {
    try {
      mkdirSync(dirname(join(to, rel)), { recursive: true });
      copyFileSync(join(from, rel), join(to, rel));
      copied.push(rel);
    } catch (error) {
      console.warn(`  Warning: could not copy ${rel}: ${error.message}`);
    }
  }

  return copied;
}

/**
 * Lists the base-to-shifted port pairs for every configured service.
 *
 * @param services - Service name mapped to base port
 * @param shift - How far this worktree's ports move
 * @returns Pairs of old port and new port
 */
export function serviceMappings(services, shift) {
  return Object.values(services).map((base) => [base, base + shift]);
}

/**
 * Rewrites every `:<port>` naming an old port to its new one, in one pass.
 *
 * @param text - File contents
 * @param mappings - Pairs of old port and new port
 * @returns The rewritten contents
 */
export function rewritePorts(text, mappings) {
  const map = new Map(mappings.map(([from, to]) => [String(from), String(to)]));
  if (map.size === 0) return text;

  const alternatives = [...map.keys()].sort((a, b) => b.length - a.length);
  // Matches `:<port>` with no digit on either side.
  const re = new RegExp(`:(${alternatives.join('|')})(?!\\d)`, 'g');
  return text.replace(re, (_, port) => `:${map.get(port)}`);
}

/**
 * Rewrites the ports in each listed file of a checkout.
 *
 * @param root - The checkout's root
 * @param files - Repo-relative paths to rewrite
 * @param mappings - Pairs of old port and new port
 * @returns The paths whose contents changed
 */
export function rewriteFiles(root, files, mappings) {
  const changed = [];

  for (const rel of files) {
    const path = join(root, rel);
    const before = readFileSync(path, 'utf8');
    const after = rewritePorts(before, mappings);
    if (after !== before) {
      writeFileSync(path, after);
      changed.push(rel);
    }
  }

  return changed;
}

/**
 * Sets a variable in each listed env file that exists, replacing any old value.
 *
 * @param root - The checkout's root
 * @param files - Repo-relative env file paths
 * @param name - The variable's name
 * @param value - Its value
 * @returns The files written to
 */
export function setEnvVar(root, files, name, value) {
  const written = [];

  for (const rel of files) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;

    const text = readFileSync(path, 'utf8');
    const line = new RegExp(`^${name}=.*$`, 'm');
    const next = line.test(text)
      ? text.replace(line, `${name}=${value}`)
      : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${name}=${value}\n`;

    writeFileSync(path, next);
    written.push(rel);
  }

  return written;
}
