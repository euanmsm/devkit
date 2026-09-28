// ============================================================================
// CLI Tests
// ============================================================================
//
// Runs the `wt` bin against throwaway repositories, end to end.

import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
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

/**
 * Makes a folder holding a fake `supabase` that logs its arguments.
 *
 * @param base - The temp folder
 * @returns The folder to put on the PATH
 */
function fakeSupabase(base) {
  const bin = join(base, 'sb-bin');
  write(
    join(bin, 'supabase'),
    `#!/bin/sh\necho "$@" >> "${join(base, 'supabase.log')}"\n`,
  );
  chmodSync(join(bin, 'supabase'), 0o755);
  return bin;
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

  test('stops the whole create when a required hook fails', () => {
    const { base, root } = fixture({
      hooks: { postCreate: ['exit 3', 'touch after.out'] },
      open: 'window',
    });
    const bin = fakeCode(base);

    const { status, out } = wt(root, ['feat', '-b', 'feat'], [bin]);

    assert.equal(status, 1);
    assert.match(out, /Setup failed: "exit 3" exited 3/);
    assert.equal(existsSync(join(base, 'app-wt', 'feat', 'after.out')), false);
    assert.equal(existsSync(join(base, 'code.log')), false);
  });

  test('warns and carries on when an optional hook fails', () => {
    const { base, root } = fixture({
      hooks: {
        postCreate: [{ run: 'exit 3', optional: true }, 'touch after.out'],
      },
    });

    const { status, out } = wt(root, ['feat', '-b', 'feat']);

    assert.equal(status, 0, out);
    assert.match(out, /Warning: "exit 3" exited 3/);
    assert.equal(existsSync(join(base, 'app-wt', 'feat', 'after.out')), true);
  });

  test('skips an unreadable folder and a broken env symlink in the main checkout', (t) => {
    const { base, root } = fixture();
    const locked = join(root, 'pgdata');
    write(join(locked, '.env'), 'X=1\n');
    chmodSync(locked, 0o000);
    t.after(() => chmodSync(locked, 0o755));
    symlinkSync('../missing/.env', join(root, '.env.broken'));

    const { status, out } = wt(root, ['feat', '-b', 'feat']);

    assert.equal(status, 0, out);
    assert.equal(
      existsSync(join(base, 'app-wt', 'feat', 'web', '.env.local')),
      true,
    );
    assert.equal(existsSync(join(base, 'app-wt', 'feat', 'hook.out')), true);
  });

  test('skips a slot another create has claimed, and reclaims a dead one', () => {
    const { root } = fixture();
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    write(join(root, '.git', 'wt-slot-1.lock'), String(process.pid));
    write(join(root, '.git', 'wt-slot-2.lock'), String(dead));

    wt(root, ['one', '-b', 'one']);
    wt(root, ['two', '-b', 'two']);

    const slots = wt(root, ['list']).out;
    assert.match(slots, /one\s+one\s+2\s/);
    assert.match(slots, /two\s+two\s+3\s/);
    assert.deepEqual(
      readdirSync(join(root, '.git')).filter((f) => f.startsWith('wt-slot-')),
      ['wt-slot-1.lock'],
    );
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

  test('skips the preDelete hooks when the folder is already gone', () => {
    const { base, root } = fixture({ hooks: { preDelete: ['true'] } });
    wt(root, ['feat', '-b', 'feat']);
    rmSync(join(base, 'app-wt', 'feat'), { recursive: true, force: true });

    const { status, out } = wt(root, ['-d', 'feat']);

    assert.equal(status, 0, out);
    assert.match(out, /skipping the preDelete hooks/);
    assert.equal(git(root, 'branch', '--list', 'feat'), '');
    assert.equal(git(root, 'worktree', 'list').split('\n').length, 1);
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

  test('uses an offset set by hand in an env file over the slot', () => {
    const { base, root } = fixture();
    wt(root, ['feat', '-b', 'feat']);
    const env = join(base, 'app-wt', 'feat', 'web', '.env.local');
    write(env, readFileSync(env, 'utf8').replace('OFFSET=100', 'OFFSET=700'));

    assert.equal(wt(join(base, 'app-wt', 'feat'), ['port', 'app']).out, '3700');
  });

  test('reads the local config from the main checkout inside a worktree', () => {
    const { base, root } = fixture();
    write(
      join(root, '.devkit', 'wt.local.json'),
      JSON.stringify({ ports: { step: 50 } }),
    );
    wt(root, ['feat', '-b', 'feat']);
    const env = join(base, 'app-wt', 'feat', 'web', '.env.local');
    write(env, readFileSync(env, 'utf8').replace(/WORKTREE.*\n/, ''));

    assert.equal(wt(join(base, 'app-wt', 'feat'), ['port', 'app']).out, '3050');
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

  test('rebuilds a missing override instead of using the main stack config', () => {
    const { base, root } = fixture({ supabase: {} });
    const bin = fakeSupabase(base);

    const created = wt(root, ['feat', '-b', 'feat'], [bin]);
    assert.match(created.out, /no supabase\/config.toml on this branch/);

    const feat = join(base, 'app-wt', 'feat');
    write(join(feat, 'supabase', 'config.toml'), 'project_id = "demo"\n');
    const { status, out } = wt(feat, ['supabase', 'status'], [bin]);

    assert.equal(status, 0, out);
    assert.equal(
      readFileSync(join(base, 'supabase.log'), 'utf8'),
      '--workdir .wt-supabase status\n',
    );
    assert.match(
      readFileSync(
        join(feat, '.wt-supabase', 'supabase', 'config.toml'),
        'utf8',
      ),
      /project_id = "demo-wt1"/,
    );
  });

  test('shifts the env files to the rebuilt stack, once', () => {
    const { base, root } = fixture({
      supabase: { envFiles: ['web/.env.local'] },
    });
    write(
      join(root, 'web', '.env.local'),
      'SUPABASE_URL=http://127.0.0.1:54321\nURL=http://localhost:3000\n',
    );
    const bin = fakeSupabase(base);
    wt(root, ['feat', '-b', 'feat'], [bin]);

    const feat = join(base, 'app-wt', 'feat');
    const env = join(feat, 'web', '.env.local');
    write(
      join(feat, 'supabase', 'config.toml'),
      'project_id = "demo"\n\n[api]\nport = 54321\n',
    );
    const { status, out } = wt(feat, ['supabase', 'check'], [bin]);

    assert.equal(status, 0, out);
    assert.match(out, /Shifted the Supabase ports in web\/\.env\.local/);
    assert.match(out, /Supabase target: http:\/\/127\.0\.0\.1:55321/);
    assert.match(
      readFileSync(env, 'utf8'),
      /^SUPABASE_URL=http:\/\/127\.0\.0\.1:55321\nURL=http:\/\/localhost:3100\n/,
    );

    rmSync(join(feat, '.wt-supabase'), { recursive: true });
    assert.equal(wt(feat, ['supabase', 'check'], [bin]).status, 0);
    assert.match(readFileSync(env, 'utf8'), /127\.0\.0\.1:55321\n/);
  });

  test('reads a supabase block set only in the local config inside a worktree', () => {
    const { base, root } = fixture();
    write(
      join(root, '.devkit', 'wt.local.json'),
      JSON.stringify({ supabase: {} }),
    );
    wt(root, ['feat', '-b', 'feat', '--no-supabase']);

    const { status, out } = wt(join(base, 'app-wt', 'feat'), [
      'supabase',
      'check',
    ]);

    assert.equal(status, 0, out);
    assert.match(out, /Supabase target: http:\/\/127\.0\.0\.1:54321/);
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
