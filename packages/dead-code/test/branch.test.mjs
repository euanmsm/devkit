// ============================================================================
// Branch Tests
// ============================================================================
//
// Runs `dead-code branch` on a feature branch, with real knip at both ends.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
  BIN,
  PROJECT,
  commit,
  deadCode,
  git,
  makeRepo,
  report,
  tempDir,
  write,
} from './repo.mjs';

const WITHOUT_ALSO_USED =
  "import { used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(used(), helper());\n";

/**
 * Makes the fixture repo and switches to a feature branch off `main`.
 *
 * @param files - Extra files for the first commit
 * @returns The repo's root
 */
function onBranch(files) {
  const root = makeRepo(files);
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

/**
 * Counts the worktrees git knows about.
 *
 * @param root - The repo's root
 * @returns How many `worktree` records `git worktree list` prints
 */
function worktrees(root) {
  return git(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length;
}

describe('dead-code branch', () => {
  test('reports an export the branch left dead in a file it did not touch', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.equal(json.mode, 'branch');
    assert.equal(json.base, 'main');
    assert.deepEqual(json.findings, [
      { type: 'export', file: 'src/lib.ts', name: 'alsoUsed', line: 11 },
    ]);
    assert.equal(worktrees(root), 1);
  });

  test('does not report debt that already existed at the fork point', () => {
    const root = onBranch();
    write(join(root, 'src/extra.ts'), 'export const extra = 1;\n');
    write(
      join(root, 'src/index.ts'),
      "import { extra } from './extra';\nimport { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(extra, used(), alsoUsed(), helper());\n",
    );
    commit(root);

    const { status, json, out } = {
      ...report(root, ['branch', 'main']),
      out: deadCode(root, ['branch', 'main']).out,
    };

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.match(out, /No new dead code since main\./);
  });

  test('does not report old debt carried by a renamed file', () => {
    const root = onBranch();
    git(root, 'mv', 'src/lib.ts', 'src/core.ts');
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './core';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );
    git(root, 'mv', 'src/orphan.ts', 'src/stray.ts');
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
  });

  test('counts uncommitted changes', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.deepEqual(
      json.findings.map((f) => f.name),
      ['alsoUsed'],
    );
  });

  test('applies known entries after the subtraction', () => {
    const root = onBranch({
      '.devkit/dead-code.json': {
        known: [{ path: 'lib', names: ['alsoUsed'], reason: 'kept' }],
      },
    });
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.deepEqual(
      json.known.map((f) => [f.name, f.reason]),
      [['alsoUsed', 'kept']],
    );
    assert.deepEqual(json.stale, []);
  });

  test('removes the temporary worktree even when knip fails at the fork point', () => {
    const root = onBranch({ 'knip.json': '{ not json' });
    writeFileSync(
      join(root, 'knip.json'),
      JSON.stringify({ entry: ['src/index.ts'], project: ['src/**/*.ts'] }),
    );
    commit(root);

    const { status, out } = deadCode(root, ['branch', 'main']);

    assert.equal(status, 2, out);
    assert.match(out, /knip/i);
    assert.equal(worktrees(root), 1);
    assert.equal(lstatSync(join(root, 'node_modules')).isDirectory(), true);
    assert.equal(existsSync(join(root, 'node_modules', '.keep')), true);
  });

  test('fails with a hint when the base has no merge base', () => {
    const root = onBranch();

    const { status, out } = deadCode(root, ['branch', 'nope']);

    assert.equal(status, 2);
    assert.match(out, /nope is not a commit in this clone\. Fetch it/);
  });
});

/** Every PROJECT file removed, for fixtures that bring their own. */
const BARE = Object.fromEntries(Object.keys(PROJECT).map((k) => [k, null]));

/**
 * Makes an npm-workspaces monorepo where package b imports from package a.
 * `hoisted` links `@x/a` from the root node_modules, as npm does; `nested` from
 * b's own node_modules, as pnpm does.
 *
 * @param layout - `hoisted` or `nested`
 * @returns The repo's root, on a branch where b no longer imports `bUses`
 */
function monorepo(layout) {
  const root = makeRepo({
    ...BARE,
    '.gitignore': 'node_modules/\n',
    'package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
    'packages/a/package.json': {
      name: '@x/a',
      version: '1.0.0',
      main: 'src/index.js',
      type: 'module',
    },
    'packages/a/src/index.js':
      "import { aUsed } from './lib.js';\nexport default aUsed;\n",
    'packages/a/src/lib.js':
      'export const aUsed = 1;\nexport const bUses = 3;\nexport const aDead = 2;\n',
    'packages/b/package.json': {
      name: '@x/b',
      version: '1.0.0',
      main: 'src/index.js',
      type: 'module',
      dependencies: { '@x/a': '1.0.0' },
    },
    'packages/b/src/index.js':
      "import { bUses } from '@x/a/src/lib.js';\nconsole.log(bUses);\n",
  });

  const scope =
    layout === 'hoisted'
      ? join(root, 'node_modules/@x')
      : join(root, 'packages/b/node_modules/@x');
  mkdirSync(scope, { recursive: true });
  symlinkSync(
    layout === 'hoisted' ? '../../packages/a' : '../../../a',
    join(scope, 'a'),
  );
  if (layout === 'hoisted') symlinkSync('../../packages/b', join(scope, 'b'));

  git(root, 'switch', '-q', '-c', 'feat');
  write(join(root, 'packages/b/src/index.js'), 'console.log(1);\n');
  commit(root);
  return root;
}

describe('dead-code branch in a monorepo', () => {
  for (const layout of ['hoisted', 'nested'])
    test(`the fork point imports its own workspace packages (${layout})`, () => {
      const root = monorepo(layout);

      const { status, json } = report(root, ['branch', 'main']);

      assert.equal(status, 1);
      assert.deepEqual(json.findings, [
        {
          type: 'export',
          file: 'packages/a/src/lib.js',
          name: 'bUses',
          line: 2,
        },
      ]);
      assert.equal(worktrees(root), 1);
      assert.equal(lstatSync(join(root, 'packages/a')).isDirectory(), true);
    });

  test('a workspace the branch added is left out at the fork point', () => {
    const root = onBranch();
    write(join(root, 'package.json'), {
      name: 'root',
      private: true,
      type: 'module',
      workspaces: ['apps/*'],
    });
    write(join(root, 'apps/web/package.json'), {
      name: 'web',
      private: true,
      type: 'module',
      main: 'src/index.ts',
    });
    write(join(root, 'apps/web/src/index.ts'), 'export const w = 1;\n');
    write(join(root, 'apps/web/src/stray.ts'), 'export const s = 1;\n');
    write(join(root, '.devkit/dead-code.json'), { workspaces: ['apps/web'] });
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['apps/web/src/stray.ts'],
    );
  });

  test('a project the branch created has no fork-point findings', () => {
    const root = makeRepo({ ...BARE, 'README.md': '# empty\n' });
    git(root, 'switch', '-q', '-c', 'feat');
    for (const [rel, contents] of Object.entries(PROJECT))
      write(join(root, rel), contents);
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.equal(json.findings.length, 3);
  });
});

describe('dead-code branch and renames', () => {
  test('a rename to a non-ASCII name carries its old debt', () => {
    const root = onBranch();
    git(root, 'mv', 'src/lib.ts', 'src/café.ts');
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './café';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
  });

  test("renames are found past git's rename limit", () => {
    const root = onBranch();
    git(root, 'config', 'diff.renameLimit', '1');
    git(root, 'mv', 'src/lib.ts', 'src/core.ts');
    git(root, 'mv', 'src/orphan.ts', 'src/stray.ts');
    // Edited too, so git has to compare contents to see the renames.
    write(
      join(root, 'src/core.ts'),
      'export function used() {\n  return 1;\n}\n\nexport function unused() {\n  return 2;\n}\n\nexport type Unused = { a: number };\n\nexport function alsoUsed() {\n  return 3;\n}\n// moved\n',
    );
    write(join(root, 'src/stray.ts'), 'export const orphan = 1;\n// moved\n');
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './core';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
  });

  test('a dead export moved into a new file that git does not pair is not new', () => {
    const root = onBranch();
    git(root, 'rm', '-q', 'src/lib.ts');
    write(
      join(root, 'src/core.ts'),
      `${'// a long preamble that git sees as unrelated content\n'.repeat(40)}export function used() {\n  return 1;\n}\n\nexport function unused() {\n  return 2;\n}\n\nexport type Unused = { a: number };\n\nexport function alsoUsed() {\n  return 3;\n}\n`,
    );
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './core';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );
    commit(root);
    assert.doesNotMatch(
      git(root, 'diff', '--name-status', '-M20%', 'main'),
      /^R/m,
    );

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
  });

  test('a move not yet staged is still a rename', () => {
    const root = onBranch();
    renameSync(join(root, 'src/lib.ts'), join(root, 'src/core.ts'));
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './core';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
    assert.equal(
      git(root, 'status', '--porcelain', '--', 'src/core.ts'),
      '?? src/core.ts',
    );
  });

  test('exports of a file that was wholly unused are not new when it is revived', () => {
    const root = onBranch();
    write(
      join(root, 'src/index.ts'),
      "import { orphan } from './orphan';\nimport { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(orphan, used(), alsoUsed(), helper());\n",
    );
    write(
      join(root, 'src/orphan.ts'),
      'export const orphan = 1;\nexport const spare = 2;\n',
    );
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'x');
    // The spare export is new on the branch, so the file carries one of each.
    git(root, 'switch', '-q', 'main');
    write(
      join(root, 'src/orphan.ts'),
      'export const orphan = 1;\nexport const spare = 2;\n',
    );
    commit(root);
    git(root, 'switch', '-q', 'feat');
    git(root, 'rebase', '-q', 'main');

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
  });
});

describe('dead-code branch and the base', () => {
  test('defaults to main when there is no remote', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);
    commit(root);

    const { status, json } = report(root, ['branch']);

    assert.equal(status, 1);
    assert.equal(json.base, 'main');
    assert.match(json.fork, /^[0-9a-f]{40}$/);
  });

  test('defaults to what origin/HEAD points at', () => {
    const root = onBranch();
    git(root, 'update-ref', 'refs/remotes/origin/trunk', 'main');
    git(
      root,
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/trunk',
    );

    const { status, json } = report(root, ['branch']);

    assert.equal(status, 0);
    assert.equal(json.base, 'origin/trunk');
  });

  test('says how to fetch the history in a shallow clone', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);
    commit(root);
    write(join(root, 'src/extra.ts'), 'export const e = 1;\n');
    commit(root);
    const clone = join(tempDir(), 'clone');
    git(
      root,
      'clone',
      '-q',
      '--depth',
      '1',
      '--branch',
      'feat',
      `file://${root}`,
      clone,
    );
    git(
      clone,
      'fetch',
      '-q',
      '--depth',
      '1',
      'origin',
      'main:refs/remotes/origin/main',
    );

    const { status, out } = deadCode(clone, ['branch', 'origin/main']);

    assert.equal(status, 2);
    assert.match(out, /shallow.*git fetch --unshallow.*fetch-depth: 0/s);
  });

  test('on the base itself, with nothing changed, finds nothing new', () => {
    const root = makeRepo();

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.equal(worktrees(root), 1);
  });
});

describe('dead-code branch and the checkout', () => {
  test('runs no hooks in the temporary worktree', (t) => {
    if (process.platform === 'win32') return t.skip('hooks need a shell');
    const root = onBranch();
    const marker = join(tempDir(), 'hook-ran');
    const hook = join(root, '.git/hooks/post-checkout');
    writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(hook, 0o755);

    const { status } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.equal(existsSync(marker), false);
  });

  test('runs no smudge filter, and leaves other worktrees registered', () => {
    const root = onBranch({ '.gitattributes': '*.bin filter=fake\n' });
    git(root, 'config', 'filter.fake.clean', 'cat');
    git(root, 'config', 'filter.fake.smudge', 'false');
    git(root, 'config', 'filter.fake.required', 'true');
    write(join(root, 'a.bin'), 'blob\n');
    commit(root);
    // A worktree whose folder is away just now, as on an unmounted drive.
    const other = join(tempDir(), 'other');
    const away = `${other}-away`;
    git(
      root,
      '-c',
      'filter.fake.smudge=cat',
      'worktree',
      'add',
      '-q',
      '--detach',
      other,
      'HEAD',
    );
    renameSync(other, away);

    const { status, out } = deadCode(root, ['branch', 'main']);

    renameSync(away, other);
    assert.equal(status, 0, out);
    assert.equal(worktrees(root), 2);
    assert.match(
      git(other, 'status', '--porcelain=v2', '--branch'),
      /branch\.oid/,
    );
  });

  test('checks submodules out at the fork point', () => {
    const sub = makeRepo({
      ...BARE,
      'lone.ts': 'export const vDead = 1;\n',
    });
    const root = makeRepo({
      'knip.json': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
    });
    git(
      root,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '-q',
      sub,
      'src/vendor',
    );
    commit(root, 'submodule');
    git(root, 'switch', '-q', '-c', 'feat');
    write(join(root, 'src/extra.ts'), 'export const e = 1;\n');
    write(
      join(root, 'src/index.ts'),
      "import { e } from './extra';\nimport { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(e, used(), alsoUsed(), helper());\n",
    );

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0, JSON.stringify(json.findings));
    assert.deepEqual(json.warnings, []);
  });

  test('removes the worktree when it is stopped with SIGTERM', async (t) => {
    if (process.platform === 'win32') return t.skip('no POSIX signals');
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    const child = spawn(process.execPath, [BIN, 'branch', 'main'], {
      cwd: root,
      stdio: 'ignore',
    });
    const exited = new Promise((resolve) =>
      child.on('exit', (code, signal) => resolve(signal)),
    );
    const start = Date.now();
    while (worktrees(root) < 2 && Date.now() - start < 10000)
      await new Promise((resolve) => setTimeout(resolve, 10));
    child.kill('SIGTERM');

    assert.equal(await exited, 'SIGTERM');
    assert.equal(worktrees(root), 1);
  });

  test('sweeps away a worktree a killed run left behind', () => {
    const root = onBranch();
    const tmp = join(tempDir('dead-code-base-'));
    const tree = join(tmp, 'tree');
    git(root, 'worktree', 'add', '-q', '--detach', tree, 'HEAD');
    // A pid no process has.
    writeFileSync(join(tmp, 'pid'), '999999');
    assert.equal(worktrees(root), 2);

    const { status } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.equal(worktrees(root), 1);
    assert.equal(existsSync(tree), false);
    assert.ok(!readdirSync(tmpdir()).some((d) => d === tmp.split('/').pop()));
  });
});

describe('dead-code branch inside a pre-commit hook', () => {
  /**
   * Installs a pre-commit hook that runs branch mode and records its exit.
   *
   * @param root - The repo's root
   * @returns The file the hook writes dead-code's exit status to
   */
  function hook(root) {
    const status = join(tempDir(), 'status');
    const path = join(root, '.git/hooks/pre-commit');
    writeFileSync(
      path,
      `#!/bin/sh\n'${process.execPath}' '${BIN}' branch main >/dev/null 2>&1\necho $? > '${status}'\nexit 0\n`,
    );
    chmodSync(path, 0o755);
    return status;
  }

  test('leaves the staged files of a plain commit alone', (t) => {
    if (process.platform === 'win32') return t.skip('hooks need a shell');
    const root = onBranch();
    const status = hook(root);
    write(join(root, 'src/added.ts'), 'export const added = 1;\n');
    git(root, 'add', 'src/added.ts');

    git(root, 'commit', '-q', '-m', 'add');

    assert.equal(readFileSync(status, 'utf8').trim(), '1');
    assert.match(
      git(root, 'ls-tree', '-r', '--name-only', 'HEAD'),
      /src\/added\.ts/,
    );
    assert.equal(git(root, 'status', '--porcelain'), '');
  });

  test('leaves the index of commit -a alone', (t) => {
    if (process.platform === 'win32') return t.skip('hooks need a shell');
    const root = onBranch();
    const status = hook(root);
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    git(root, 'commit', '-a', '-q', '-m', 'edit');

    assert.equal(readFileSync(status, 'utf8').trim(), '1');
    assert.equal(
      git(root, 'show', 'HEAD:src/index.ts'),
      WITHOUT_ALSO_USED.trim(),
    );
    assert.equal(git(root, 'status', '--porcelain'), '');
  });

  test('leaves the staged files alone in a linked worktree', (t) => {
    if (process.platform === 'win32') return t.skip('hooks need a shell');
    const root = makeRepo();
    const status = hook(root);
    const linked = join(tempDir(), 'linked');
    git(root, 'worktree', 'add', '-q', '-b', 'feat', linked);
    write(join(linked, 'src/added.ts'), 'export const added = 1;\n');
    git(linked, 'add', 'src/added.ts');

    git(linked, 'commit', '-q', '-m', 'add');

    assert.equal(readFileSync(status, 'utf8').trim(), '1');
    assert.match(
      git(linked, 'ls-tree', '-r', '--name-only', 'HEAD'),
      /src\/added\.ts/,
    );
    assert.equal(git(linked, 'status', '--porcelain'), '');
  });
});
