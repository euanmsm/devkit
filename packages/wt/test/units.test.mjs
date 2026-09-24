// ============================================================================
// Unit Tests
// ============================================================================
//
// Covers the pure pieces: config merging, env port rewriting, workspace-file
// edits and `config.toml` patching.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { merge, validate, worktreesDir } from '../src/config.mjs';
import { globToRegex, rewritePorts } from '../src/env.mjs';
import {
  patchConfig,
  setKey,
  supabaseMappings,
} from '../src/supabase/project.mjs';
import {
  addFolder,
  isInside,
  listFolders,
  removeFolders,
} from '../src/workspace.mjs';

describe('config', () => {
  test('lays the local file over the shared one, section by section', () => {
    const config = merge(
      { open: 'window', ports: { step: 10, services: { app: 3000 } } },
      { open: 'none', ports: { step: 50 } },
    );

    assert.equal(config.open, 'none');
    assert.deepEqual(config.ports.services, { app: 3000 });
    assert.equal(config.ports.step, 50);
    assert.equal(config.remote, 'origin');
    assert.equal(config.supabase, null);
  });

  test('fills the supabase defaults once the block exists', () => {
    const config = merge({ supabase: { basePort: 60000 } }, {});

    assert.equal(config.supabase.basePort, 60000);
    assert.equal(config.supabase.dir, 'supabase');
  });

  test('ignores note keys starting with an underscore', () => {
    const raw = { _readme: 'hi', dir: '../x' };

    assert.deepEqual(validate(merge(raw, {}), raw), []);
  });

  test('names each bad field', () => {
    const raw = {
      open: 'workspace',
      ports: { services: { app: 99999 }, killOnDelete: ['web'] },
      hooks: { postCreate: ['npm ci', { run: 1 }] },
      supabase: { dir: 'db' },
    };

    const problems = validate(merge(raw, {}), raw).join('\n');

    assert.match(problems, /"workspaceFile" must be set/);
    assert.match(problems, /"ports.services.app" must be a port/);
    assert.match(problems, /not "web"/);
    assert.match(problems, /"supabase.dir"/);
    assert.match(problems, /"hooks.postCreate"/);
  });

  test('puts the repo folder name into the worktrees folder', () => {
    assert.equal(
      worktreesDir({ dir: '../{repo}-wt' }, '/code/app'),
      '/code/app-wt',
    );
  });
});

describe('env ports', () => {
  test('shifts each port once, even when one target is another source', () => {
    const text = 'A=:3000\nB=:3001\n';

    assert.equal(
      rewritePorts(text, [
        [3000, 3001],
        [3001, 3002],
      ]),
      'A=:3001\nB=:3002\n',
    );
  });

  test('leaves a longer port that starts with a mapped one', () => {
    assert.equal(
      rewritePorts('X=:30001 Y=:3000/', [[3000, 3100]]),
      'X=:30001 Y=:3100/',
    );
  });

  test('matches file patterns against whole names', () => {
    const re = globToRegex('.env*');

    assert.ok(re.test('.env.local'));
    assert.ok(!re.test('x.env'));
  });
});

describe('workspace file', () => {
  const FILE = '{\n  "folders": [\n    { "path": "main" }\n  ]\n}\n';

  test('appends an entry, matching the existing indentation', () => {
    const out = addFolder(FILE, { path: 'wt/a' });

    assert.equal(
      out,
      '{\n  "folders": [\n    { "path": "main" },\n    { "path": "wt/a" }\n  ]\n}\n',
    );
  });

  test("keeps a comment on the last entry's line with that entry", () => {
    const text = '{ "folders": [\n\t{ "path": "main" } // main\n] }';

    const out = addFolder(text, { path: 'wt/a' });

    assert.equal(
      out,
      '{ "folders": [\n\t{ "path": "main" }, // main\n\t{ "path": "wt/a" }\n] }',
    );
  });

  test('fills an empty array', () => {
    const out = addFolder('{\n\t"folders": []\n}', { path: 'wt/a' });

    assert.deepEqual(
      listFolders(out).map((f) => f.path),
      ['wt/a'],
    );
  });

  test('does not add a path twice', () => {
    const once = addFolder(FILE, { path: 'wt/a' });

    assert.equal(addFolder(once, { path: 'wt/a' }), once);
  });

  test('removes only the picked entries, first, middle or last', () => {
    const text =
      '{ "folders": [\n  { "path": "a" },\n  { "path": "b" },\n  { "path": "c" }\n] }';

    for (const drop of ['a', 'b', 'c']) {
      const left = listFolders(removeFolders(text, (p) => p === drop)).map(
        (f) => f.path,
      );
      assert.deepEqual(
        left,
        ['a', 'b', 'c'].filter((p) => p !== drop),
      );
    }
  });

  test('refuses a file with no folders array', () => {
    assert.throws(
      () => addFolder('{ "settings": {} }', { path: 'x' }),
      /no "folders" array/,
    );
  });

  test('refuses a file that does not parse', () => {
    assert.throws(() => listFolders('{ "folders": [ }'), /does not parse/);
  });

  test('knows when a path sits inside a folder', () => {
    assert.ok(isInside('/a/wt/x', '/a/wt'));
    assert.ok(!isInside('/a/wt-other', '/a/wt'));
  });
});

describe('supabase config patch', () => {
  const TRACKED = [
    'project_id = "demo"',
    '',
    '[api]',
    'enabled = true',
    '',
    '[db.pooler]',
    'enabled = false',
    '',
    '[inbucket]',
    'enabled = true',
    'smtp_port = 54325',
    '',
    '[auth]',
    'additional_redirect_urls = [',
    '  "http://127.0.0.1:3000/**",',
    ']',
    '',
    '[remotes.production]',
    'project_id = "prod"',
    '',
  ].join('\n');

  const patched = patchConfig(TRACKED, { slot: 2, base: 56320, appPort: 3200 });

  test('suffixes the local project id and leaves remotes alone', () => {
    assert.match(patched, /^project_id = "demo-wt2"$/m);
    assert.match(patched, /^project_id = "prod"$/m);
  });

  test('pins every port inside the slot range', () => {
    assert.match(patched, /\[api\]\nport = 56321/);
    assert.match(patched, /\[inbucket\]\nport = 56324/);
    assert.match(patched, /^smtp_port = 56325$/m);
    assert.match(patched, /\[analytics\]\nport = 56327/);
  });

  test('adds a missing [db] ahead of [db.pooler]', () => {
    assert.match(
      patched,
      /\[db\]\nport = 56322\nshadow_port = 56320|\[db\]\nshadow_port = 56320\nport = 56322/,
    );
    assert.ok(patched.indexOf('[db]') < patched.indexOf('[db.pooler]'));
  });

  test('points auth at the app port, keeping existing redirect urls', () => {
    assert.match(patched, /^site_url = "http:\/\/127\.0\.0\.1:3200"$/m);
    assert.match(
      patched,
      /^additional_redirect_urls = \["http:\/\/127\.0\.0\.1:3000\/\*\*", "http:\/\/127\.0\.0\.1:3200\/\*\*", "http:\/\/localhost:3200\/\*\*"\]$/m,
    );
  });

  test('leaves a key alone when asked to set it only if present', () => {
    assert.equal(
      setKey('[a]\nx = 1\n', 'a', 'y', '2', { onlyIfPresent: true }),
      '[a]\nx = 1\n',
    );
  });

  test('maps the whole main-checkout range onto the slot range', () => {
    const pairs = supabaseMappings({ basePort: 54320, step: 1000 }, 1);

    assert.deepEqual(pairs[1], [54321, 55321]);
    assert.equal(pairs.length, 10);
  });
});
