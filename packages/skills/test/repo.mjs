// ============================================================================
// Test Repositories
// ============================================================================
//
// Throwaway repository roots for the sync, check and prepass tests.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Makes an empty repository root holding the given `.devkit` files.
 *
 * @param devkit - File contents by name; objects are written as JSON, strings as they are
 * @returns The root's absolute path
 */
export function makeRepo(devkit = {}) {
  const root = mkdtempSync(join(tmpdir(), 'skills-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));

  for (const [name, body] of Object.entries(devkit)) {
    writeFileSync(
      join(root, '.devkit', name),
      typeof body === 'string' ? body : JSON.stringify(body),
    );
  }

  return root;
}

/**
 * Writes a file under a root, creating its directories.
 *
 * @param root - The repository root
 * @param path - Path relative to the root
 * @param content - The file's text
 */
export function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
