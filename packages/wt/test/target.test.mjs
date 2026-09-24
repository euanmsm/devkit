// ============================================================================
// Supabase Target Tests
// ============================================================================
//
// Each test builds a throwaway tree and resolves against it, with the real
// environment's Supabase variables blanked.

import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  findTargetMismatch,
  requireSupabaseTarget,
  resetSupabaseTargetCache,
  resolveSupabaseTarget,
} from '../src/supabase/target.mjs';
import { write } from './repo.mjs';

const VARS = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ALLOW_CROSS_WORKTREE',
];

const TRACKED =
  'project_id = "demoproject"\n\n[api]\nschemas = ["public"]\n\n[db]\nport = 54322\n';

/**
 * Builds a worktree override config, with `[db]` ahead of `[api]`.
 *
 * @param slot - The worktree's slot
 * @returns The config's text
 */
function overrideConfig(slot) {
  const shift = slot * 1000;
  return `project_id = "demoproject-wt${slot}"\n\n[db]\nport = ${54322 + shift}\n\n[api]\nport = ${54321 + shift}\n\n[remotes.production]\nproject_id = "prodproject"\n`;
}

/**
 * Builds a throwaway tree with a wt config pointing at `apps/main/.env.local`.
 *
 * @param options - Worktree `slot`, `envLocal` contents and an `extra` env file
 * @returns The tree's root
 */
function makeTree({ slot, envLocal, extra } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wt-target-')));
  write(
    join(root, '.devkit', 'wt.json'),
    JSON.stringify({ supabase: { envFiles: ['apps/main/.env.local'] } }),
  );
  write(join(root, 'supabase', 'config.toml'), TRACKED);

  if (slot !== undefined)
    write(
      join(root, '.wt-supabase', 'supabase', 'config.toml'),
      overrideConfig(slot),
    );
  if (envLocal !== undefined)
    write(join(root, 'apps', 'main', '.env.local'), envLocal);
  if (extra) write(join(root, extra.path), extra.contents);

  return root;
}

let saved = {};

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
  for (const v of VARS) delete process.env[v];
  resetSupabaseTargetCache();
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe('the expected stack', () => {
  test('is the CLI default port in a plain checkout', () => {
    const target = resolveSupabaseTarget({ root: makeTree() });

    assert.equal(target.expectedUrl, 'http://127.0.0.1:54321');
    assert.equal(target.projectId, 'demoproject');
  });

  test('is the override api port in a worktree, not the db port above it', () => {
    const target = resolveSupabaseTarget({ root: makeTree({ slot: 2 }) });

    assert.equal(target.expectedUrl, 'http://127.0.0.1:56321');
    assert.equal(target.projectId, 'demoproject-wt2');
  });
});

describe('resolving the url and key', () => {
  test('prefers SUPABASE_URL from the real environment', () => {
    process.env.SUPABASE_URL = 'https://real.supabase.co';
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321\n',
    });

    const target = resolveSupabaseTarget({ root });

    assert.equal(target.url, 'https://real.supabase.co');
    assert.equal(target.urlSource, 'SUPABASE_URL');
  });

  test('treats a blank environment variable as absent', () => {
    process.env.SUPABASE_URL = '   ';
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321\n',
    });

    assert.equal(resolveSupabaseTarget({ root }).url, 'http://127.0.0.1:56321');
  });

  test('reads a quoted value from a configured env file', () => {
    const root = makeTree({
      slot: 2,
      envLocal: "NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:56321'\n",
    });

    const target = resolveSupabaseTarget({ root });

    assert.equal(target.url, 'http://127.0.0.1:56321');
    assert.match(target.urlSource, /apps\/main\/\.env\.local/);
  });

  test('reads a caller-supplied env file first', () => {
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321\n',
      extra: {
        path: 'harness/.env',
        contents: 'SUPABASE_URL=https://harness.supabase.co\n',
      },
    });

    const target = resolveSupabaseTarget({
      root,
      envFiles: [join(root, 'harness', '.env')],
    });

    assert.equal(target.url, 'https://harness.supabase.co');
  });

  test("uses the tree's own stack when no env value exists", () => {
    const target = resolveSupabaseTarget({ root: makeTree({ slot: 3 }) });

    assert.equal(target.url, 'http://127.0.0.1:57321');
    assert.equal(target.serviceRoleKey, '');
    assert.equal(target.keySource, 'unresolved');
  });

  test('reads the service-role key from the env file', () => {
    const root = makeTree({
      slot: 2,
      envLocal: "SUPABASE_SERVICE_ROLE_KEY='sb_secret_abc'\n",
    });

    assert.equal(
      resolveSupabaseTarget({ root }).serviceRoleKey,
      'sb_secret_abc',
    );
  });
});

describe('findTargetMismatch', () => {
  test("flags an env file still on the main checkout's port", () => {
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n',
    });

    const mismatch = findTargetMismatch(resolveSupabaseTarget({ root }));

    assert.match(mismatch, /not this tree's stack/);
    assert.match(mismatch, /56321/);
    assert.match(mismatch, /demoproject-wt2/);
  });

  test('passes a matching port, whether named 127.0.0.1 or localhost', () => {
    for (const host of ['127.0.0.1', 'localhost']) {
      const root = makeTree({
        slot: 2,
        envLocal: `NEXT_PUBLIC_SUPABASE_URL=http://${host}:56321\n`,
      });
      assert.equal(findTargetMismatch(resolveSupabaseTarget({ root })), null);
    }
  });

  test('never flags a remote target', () => {
    process.env.SUPABASE_URL = 'https://branch-ref.supabase.co';

    assert.equal(
      findTargetMismatch(
        resolveSupabaseTarget({ root: makeTree({ slot: 2 }) }),
      ),
      null,
    );
  });

  test('flags a malformed url without throwing', () => {
    process.env.SUPABASE_URL = 'not-a-url';

    assert.match(
      findTargetMismatch(
        resolveSupabaseTarget({ root: makeTree({ slot: 2 }) }),
      ),
      /not a valid URL/,
    );
  });
});

describe('requireSupabaseTarget', () => {
  test('throws when the target is another stack', () => {
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n',
    });

    assert.throws(() => requireSupabaseTarget({ root }), /Refusing to run/);
  });

  test('warns instead when the bypass is set', (t) => {
    process.env.SUPABASE_ALLOW_CROSS_WORKTREE = '1';
    const warn = t.mock.method(console, 'warn', () => {});
    const root = makeTree({
      slot: 2,
      envLocal: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n',
    });

    assert.equal(requireSupabaseTarget({ root }).url, 'http://127.0.0.1:54321');
    assert.equal(warn.mock.callCount(), 1);
  });
});
