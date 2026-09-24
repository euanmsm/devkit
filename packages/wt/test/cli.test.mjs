// ============================================================================
// CLI Tests
// ============================================================================
//
// Runs the `wt` bin against throwaway repositories, end to end.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { fakeCode, git, makeRepo, write, wt } from './repo.mjs';

const CONFIG = {
  dir: '../app-wt',
  ports: {
    services: { app: 3000, docs: 3001 },
    offsetEnv: { name: 'WORKTREE_PORT_OFFSET', files: ['web/.env.local'] },
  },
  hooks: {
    postCreate: ['echo "$WT_NAME $WT_BRANCH $WT_SLOT $WT_OFFSET" > hook.out'],
  },
  open: 'none',
};

/**
 * Builds a repo with the standard config, a gitignored env file and a tracked one.
 *
 * @param config - Overrides spread over the standard config
 * @returns The temp folder and the repo's root
 */
function fixture(config = {}) {
  const repo = makeRepo({
    '.gitignore':
      '.env*\n!.env.example\n.wt-supabase/\n.devkit/wt.local.json\nhook.out\n',
    '.devkit/wt.json': { ...CONFIG, ...config },
    '.env.example': 'URL=http://localhost:3000\n',
  });
  write(
    join(repo.root, 'web', '.env.local'),
    'URL=http://localhost:3000\nDOCS=:3001\nOTHER=:30001\n',
  );
  return repo;
}

describe('creating a worktree', () => {
  test('lands in the worktrees folder under its own name, apart from the branch', () => {
    const { base, root } = fixture();

    const { status, out } = wt(root, ['feat', '-b', 'someone/feat-x']);

    assert.equal(status, 0, out);
    const path = join(base, 'app-wt', 'feat');
    assert.equal(git(path, 'branch', '--show-current'), 'someone/feat-x');
    assert.equal(
      readFileSync(join(path, 'hook.out'), 'utf8'),
      'feat someone/feat-x 1 100\n',
    );
  });

  test('copies untracked env files and shifts every configured port once', () => {
    const { base, root } = fixture();

    wt(root, ['feat', '-b', 'feat']);

    const env = readFileSync(
      join(base, 'app-wt', 'feat', 'web', '.env.local'),
      'utf8',
    );
    assert.equal(
      env,
      'URL=http://localhost:3100\nDOCS=:3101\nOTHER=:30001\nWORKTREE_PORT_OFFSET=100\n',
    );
    assert.equal(
      readFileSync(join(base, 'app-wt', 'feat', '.env.example'), 'utf8'),
      'URL=http://localhost:3000\n',
    );
  });

  test('gives each worktree the lowest free slot, reusing a deleted one', () => {
    const { root } = fixture();

    wt(root, ['one', '-b', 'one']);
    wt(root, ['two', '-b', 'two']);
    wt(root, ['-d', 'one']);
    wt(root, ['three', '-b', 'three']);

    const slots = wt(root, ['list']).out;
    assert.match(slots, /three\s+three\s+1\s+\+100/);
    assert.match(slots, /two\s+two\s+2\s+\+200/);
  });

  test('checks out an existing branch as it is', () => {
    const { base, root } = fixture();
    git(root, 'branch', 'existing');

    wt(root, ['ex', '-b', 'existing']);

    assert.equal(
      git(join(base, 'app-wt', 'ex'), 'branch', '--show-current'),
      'existing',
    );
  });

  test('forks a new branch from the base given with -f', () => {
    const { base, root } = fixture();
    git(root, 'checkout', '-q', '-b', 'side');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'side');
    git(root, 'checkout', '-q', 'main');

    wt(root, ['f', '-b', 'forked', '-f', 'side']);

    assert.equal(
      git(join(base, 'app-wt', 'f'), 'log', '-1', '--format=%s'),
      'side',
    );
  });

  test('makes a detached worktree when asked', () => {
    const { base, root } = fixture();

    const { status } = wt(root, ['scratch', '--detach']);

    assert.equal(status, 0);
    assert.equal(
      git(join(base, 'app-wt', 'scratch'), 'branch', '--show-current'),
      '',
    );
  });

  test('refuses a name holding a slash', () => {
    const { root } = fixture();

    const { status, out } = wt(root, ['someone/feat', '-b', 'x']);

    assert.equal(status, 1);
    assert.match(out, /not a usable worktree name/);
  });

  test('refuses to run without a branch', () => {
    const { root } = fixture();

    const { status, out } = wt(root, ['feat']);

    assert.equal(status, 1);
    assert.match(out, /branch is required/);
  });

  test('refuses a config with an unknown setting', () => {
    const { root } = fixture({ directory: '../x' });

    const { status, out } = wt(root, ['feat', '-b', 'feat']);

    assert.equal(status, 1);
    assert.match(out, /"directory" is not a known setting/);
  });
});

describe('deleting a worktree', () => {
  test('removes the folder and the branch, looked up from the worktree', () => {
    const { base, root } = fixture();
    wt(root, ['feat', '-b', 'someone/feat']);

    const { status, out } = wt(root, ['-d', 'feat']);

    assert.equal(status, 0, out);
    assert.equal(existsSync(join(base, 'app-wt', 'feat')), false);
    assert.equal(git(root, 'branch', '--list', 'someone/feat'), '');
  });

  test('keeps the branch with --save-branch', () => {
    const { root } = fixture();
    wt(root, ['feat', '-b', 'feat']);

    wt(root, ['-d', 'feat', '--save-branch']);

    assert.match(git(root, 'branch', '--list', 'feat'), /feat/);
  });

  test('fails on an unknown name', () => {
    const { root } = fixture();

    const { status, out } = wt(root, ['-d', 'nope']);

    assert.equal(status, 1);
    assert.match(out, /No worktree named nope/);
  });
});

describe('ports', () => {
  test('prints base ports in the main checkout and shifted ones in a worktree', () => {
    const { base, root } = fixture();
    wt(root, ['feat', '-b', 'feat']);

    assert.equal(wt(root, ['port', 'app']).out, '3000');
    assert.equal(
      wt(join(base, 'app-wt', 'feat', 'web'), ['port', 'docs']).out,
      '3101',
    );
  });

  test('names the known services for an unknown one', () => {
    const { root } = fixture();

    const { status, out } = wt(root, ['port', 'nope']);

    assert.equal(status, 1);
    assert.match(out, /Known: app, docs/);
  });
});

describe('opening in a workspace', () => {
  test('adds and removes only the worktree entry, keeping the rest of the file', () => {
    const { base, root } = fixture();
    const file = join(base, 'app.code-workspace');
    const original =
      '{\n\t// mine\n\t"folders": [\n\t\t{ "path": "app-main" },\n\t\t{ "path": "../other" }, // keep\n\t],\n\t"settings": {}\n}\n';
    write(file, original);
    write(
      join(root, '.devkit', 'wt.local.json'),
      JSON.stringify({
        open: 'workspace',
        workspaceFile: '../app.code-workspace',
      }),
    );
    const bin = fakeCode(base);

    wt(root, ['feat', '-b', 'feat'], [bin]);

    assert.equal(
      readFileSync(file, 'utf8'),
      '{\n\t// mine\n\t"folders": [\n\t\t{ "path": "app-main" },\n\t\t{ "path": "../other" }, // keep\n\t\t{ "name": "wt: feat", "path": "app-wt/feat" },\n\t],\n\t"settings": {}\n}\n',
    );
    assert.equal(readFileSync(join(base, 'code.log'), 'utf8'), `${file}\n`);

    wt(root, ['-d', 'feat'], [bin]);

    assert.equal(readFileSync(file, 'utf8'), original);
  });

  test('creates the workspace file when it is missing', () => {
    const { base, root } = fixture({
      open: 'workspace',
      workspaceFile: '../new.code-workspace',
    });

    wt(root, ['feat', '-b', 'feat'], [fakeCode(base)]);

    const folders = JSON.parse(
      readFileSync(join(base, 'new.code-workspace'), 'utf8'),
    ).folders;
    assert.deepEqual(folders, [
      { path: 'app-main' },
      { name: 'wt: feat', path: 'app-wt/feat' },
    ]);
  });
});

describe('supabase', () => {
  test('builds a port-shifted override project without booting a stack', () => {
    const { base, root } = fixture({ supabase: { appService: 'app' } });
    write(
      join(root, 'supabase', 'config.toml'),
      'project_id = "demo"\n\n[api]\nenabled = true\n',
    );
    write(join(root, 'supabase', 'seed.sql'), 'select 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'supabase');

    const { status, out } = wt(root, ['feat', '-b', 'feat', '--no-supabase']);

    assert.equal(status, 0, out);
    const override = join(base, 'app-wt', 'feat', '.wt-supabase', 'supabase');
    const config = readFileSync(join(override, 'config.toml'), 'utf8');
    assert.match(config, /project_id = "demo-wt1"/);
    assert.match(config, /\[api\]\nport = 55321/);
    assert.equal(
      readFileSync(join(override, 'seed.sql'), 'utf8'),
      'select 1;\n',
    );
    assert.match(out, /Supabase: not booted/);
  });

  test('counts a slot held by a worktree the shell script made', () => {
    const { base, root } = fixture();
    const legacy = join(base, 'app-main--old');
    git(root, 'worktree', 'add', '-q', '-b', 'old', legacy);
    write(
      join(legacy, '.wt-supabase', 'supabase', 'config.toml'),
      'project_id = "demo-wt1"\n',
    );

    wt(root, ['feat', '-b', 'feat']);

    assert.match(wt(root, ['list']).out, /feat\s+feat\s+2\s/);
  });
});
