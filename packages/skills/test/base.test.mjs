// ============================================================================
// Base Branch Tests
// ============================================================================
//
// How a branch skill finds the branch to compare against: each source in
// order, stacked and merged parents, stale copies of the base, and the
// `skills base` command that hands the answer to a skill.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { baseCommand } from '../src/base-cli.mjs';
import { baseAssignments, resolveBase, stackParent } from '../src/base.mjs';
import { runShell, SHELLS, staleBaseRepo } from './stale-base.mjs';

/**
 * Makes a repository with `main` and a branch `feat` holding one commit.
 *
 * @param options - `from` names the start point `feat` is created from, by name so the reflog records it
 * @returns The repository path and a `git` runner for it
 */
function repoWith({ from = 'main' } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'skills-resolve-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd: repo, encoding: 'utf8', stdio: 'pipe' },
    ).trim();
  const commit = (file) => {
    writeFileSync(join(repo, file), `${file}\n`);
    git('add', file);
    git('commit', '-q', '-m', file);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q', '-b', 'main');
  commit('base.txt');
  git('branch', 'parent');
  git('switch', '-q', 'parent');
  const parentHead = commit('parent.txt');
  git('switch', '-q', 'main');
  git('branch', 'feat', from);
  git('switch', '-q', 'feat');
  commit('feat.txt');

  return { repo, git, commit, parentHead };
}

/**
 * Builds a `run` that answers `gh` from a table and runs git for real.
 *
 * @param gh - Maps a `gh` subcommand, such as `pr view` or `stack view`, to its stdout, or to an Error to throw
 * @returns The runner, which records every gh call in `run.calls`
 */
function runner(gh = {}) {
  const run = (command, args, cwd) => {
    if (command !== 'gh') {
      return execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }
    run.calls.push(args.join(' '));
    const key = args.slice(0, 2).join(' ');
    const answer = gh[key];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) {
      throw Object.assign(new Error('gh failed'), {
        stderr: `unknown command "${args[0]}" for "gh"`,
      });
    }
    return typeof answer === 'string' ? answer : JSON.stringify(answer);
  };
  run.calls = [];
  return run;
}

const NO_PR = Object.assign(new Error('gh failed'), {
  stderr: 'no pull requests found for branch "feat"',
});

describe('resolveBase — where the parent comes from', () => {
  it('uses the branch given before anything else', () => {
    const { repo, parentHead } = repoWith({ from: 'parent' });
    const run = runner({ 'stack view': { branches: ['main', 'feat'] } });

    const base = resolveBase(repo, {
      explicit: 'parent',
      baseBranch: 'main',
      run,
    });

    assert.equal(base.base, 'parent');
    assert.equal(base.source, 'given');
    assert.equal(base.fork, parentHead);
    assert.equal(base.branch, 'feat');
    assert.deepEqual(run.calls, []);
  });

  it('takes the base of the open PR when the repository has an origin', () => {
    const { repo, git, parentHead } = repoWith({ from: 'parent' });
    git('remote', 'add', 'origin', join(repo, 'nowhere'));
    const run = runner({
      'pr view': { number: 992, baseRefName: 'parent', state: 'OPEN' },
    });

    const base = resolveBase(repo, { baseBranch: 'main', run });

    assert.equal(base.base, 'parent');
    assert.equal(base.source, 'PR #992');
    assert.equal(base.fork, parentHead);
    assert.deepEqual(base.warnings, []);
    assert.ok(
      run.calls.includes('pr view feat --json number,baseRefName,state'),
    );
  });

  it('skips a closed PR and a branch with none', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('remote', 'add', 'origin', join(repo, 'nowhere'));

    for (const answer of [
      { number: 1, baseRefName: 'main', state: 'MERGED' },
      NO_PR,
    ]) {
      const base = resolveBase(repo, {
        baseBranch: 'main',
        run: runner({ 'pr view': answer }),
      });
      assert.equal(base.base, 'parent');
      assert.equal(base.source, 'the branch reflog');
      assert.deepEqual(base.warnings, []);
    }
  });

  it('warns and moves on when GitHub cannot be asked', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('remote', 'add', 'origin', join(repo, 'nowhere'));
    const offline = Object.assign(new Error('gh failed'), {
      stderr: 'error connecting to api.github.com',
    });

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr view': offline }),
    });

    assert.equal(base.base, 'parent');
    assert.match(base.warnings[0], /Could not ask GitHub.*error connecting/);
  });

  it('stays quiet when origin is not on GitHub', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('remote', 'add', 'origin', join(repo, 'nowhere'));
    const notGithub = Object.assign(new Error('gh failed'), {
      stderr:
        'none of the git remotes configured for this repository point to a known GitHub host',
    });

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr view': notGithub }),
    });

    assert.deepEqual(base.warnings, []);
  });

  it('does not ask GitHub for a PR when there is no origin', () => {
    const { repo } = repoWith({ from: 'parent' });
    const run = runner();

    resolveBase(repo, { baseBranch: 'main', run });

    assert.ok(!run.calls.some((call) => call.startsWith('pr ')));
  });

  it('takes the branch below this one in a gh stack', () => {
    const { repo } = repoWith();
    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'stack view': { branches: ['main', 'parent', 'feat'] } }),
    });

    assert.equal(base.base, 'parent');
    assert.equal(base.source, 'gh stack');
  });

  it('takes the parent git recorded when the branch was created', () => {
    const { repo, git } = repoWith();
    git('config', 'branch.feat.vscode-merge-base', 'origin/parent');

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'parent');
    assert.equal(base.source, 'recorded when the branch was created');
  });

  it('strips any remote from a recorded parent, not only origin', () => {
    const { repo, git } = repoWith();
    git('remote', 'add', 'upstream', join(repo, 'nowhere'));
    git('config', 'branch.feat.vscode-merge-base', 'upstream/parent');

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr view': NO_PR }),
      fetch: false,
    });

    assert.equal(base.base, 'parent');
  });

  it('ignores a recorded parent that names the branch itself', () => {
    const { repo, git } = repoWith();
    git('config', 'branch.feat.vscode-merge-base', 'origin/feat');

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'main');
    assert.equal(base.source, 'the branch reflog');
  });

  it('reads the reflog when nothing else names a parent', () => {
    const { repo, parentHead } = repoWith({ from: 'parent' });

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'parent');
    assert.equal(base.source, 'the branch reflog');
    assert.equal(base.fork, parentHead);
  });

  it('falls back to the default branch only when no source answers', () => {
    const { repo, git } = repoWith();
    // A branch created from a commit leaves no branch name in its reflog.
    git('switch', '-q', '-c', 'loose', git('rev-parse', 'HEAD'));

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'main');
    assert.equal(base.source, 'default branch');
  });

  it('warns when the PR and the recorded parent disagree, and follows the PR', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('remote', 'add', 'origin', join(repo, 'nowhere'));
    git('config', 'branch.feat.vscode-merge-base', 'parent');

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({
        'pr view': { number: 5, baseRefName: 'main', state: 'OPEN' },
      }),
    });

    assert.equal(base.base, 'main');
    assert.equal(base.source, 'PR #5');
    assert.match(
      base.warnings[0],
      /PR #5 targets main, but the branch was created from parent/,
    );
  });

  it('refuses to compare the default branch with itself', () => {
    const { repo, git } = repoWith();
    git('switch', '-q', 'main');

    assert.throws(
      () => resolveBase(repo, { baseBranch: 'main', run: runner() }),
      /On main itself; there is no parent branch/,
    );
  });

  it('uses the default branch on a detached HEAD', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('switch', '-q', '--detach', 'feat');

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'main');
    assert.equal(base.source, 'default branch, detached HEAD');
    assert.equal(base.branch, '');
  });
});

describe('resolveBase — parents that merged or went away', () => {
  it('gives way to the default branch once the parent is merged into it', () => {
    // parent was squash-merged into main, then feat was rebased onto main.
    const { repo, git, commit } = repoWith();
    git('config', 'branch.feat.vscode-merge-base', 'parent');
    git('switch', '-q', 'main');
    const squash = commit('squashed.txt');
    git('switch', '-q', 'feat');
    git('rebase', '-q', 'main');

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'main');
    assert.equal(base.fork, squash);
    assert.match(base.source, /merged into main/);
    assert.match(base.warnings[0], /parent .* looks merged/);
  });

  it('keeps an unmerged parent even after main moves on', () => {
    const { repo, git, commit, parentHead } = repoWith({ from: 'parent' });
    git('switch', '-q', 'main');
    commit('later.txt');
    git('switch', '-q', 'feat');

    const base = resolveBase(repo, { baseBranch: 'main', run: runner() });

    assert.equal(base.base, 'parent');
    assert.equal(base.fork, parentHead);
  });

  it('diffs from a squash-merged parent’s last commit once its branch is gone', () => {
    const { repo, git, commit, parentHead } = repoWith({ from: 'parent' });
    git('switch', '-q', 'main');
    commit('squashed.txt');
    git('switch', '-q', 'feat');
    git('branch', '-q', '-D', 'parent');

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr list': [{ headRefOid: parentHead }] }),
    });

    assert.equal(base.base, 'main');
    assert.equal(base.ref, 'main');
    assert.equal(base.fork, parentHead);
    assert.match(base.warnings[0], /parent .* has merged and is gone/);
    assert.equal(
      execFileSync('git', ['diff', '--name-only', base.fork, 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
      'feat.txt',
    );
  });

  it('stops when the parent is gone and never merged', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('branch', '-q', '-D', 'parent');

    assert.throws(
      () =>
        resolveBase(repo, {
          baseBranch: 'main',
          run: runner({ 'pr list': [] }),
        }),
      /parent branch parent \(the branch reflog\) is not here.*pass --base <branch>/,
    );
  });

  it('accepts any commit git can name as the base given, such as a tag', () => {
    const { repo, git, parentHead } = repoWith({ from: 'parent' });
    git('tag', 'v1', 'parent');

    for (const explicit of ['v1', parentHead, 'refs/heads/parent']) {
      const base = resolveBase(repo, {
        explicit,
        baseBranch: 'main',
        run: runner(),
        fetch: false,
      });
      assert.equal(base.ref, explicit);
      assert.equal(base.fork, parentHead, explicit);
    }
  });

  it('compares from where the branch left a merged parent it forked from early', () => {
    // feat left parent at P1; parent gained P2, squash-merged, and was deleted.
    const { repo, git, commit, parentHead } = repoWith({ from: 'parent' });
    git('switch', '-q', 'parent');
    const later = commit('parent-later.txt');
    git('switch', '-q', 'main');
    commit('squashed.txt');
    git('switch', '-q', 'feat');
    git('branch', '-q', '-D', 'parent');

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr list': [{ headRefOid: later }] }),
    });

    assert.equal(base.fork, parentHead);
    assert.match(base.warnings[0], /from where this branch left it/);
  });

  it('says so when a merged parent’s commits are not here', () => {
    const { repo, git } = repoWith({ from: 'parent' });
    git('branch', '-q', '-D', 'parent');

    const base = resolveBase(repo, {
      baseBranch: 'main',
      run: runner({ 'pr list': [{ headRefOid: 'f'.repeat(40) }] }),
    });

    assert.equal(base.base, 'main');
    assert.match(base.warnings[0], /its commits are not here/);
  });

  it('stops when the branch given does not exist', () => {
    const { repo } = repoWith();

    assert.throws(
      () =>
        resolveBase(repo, {
          explicit: 'nope',
          baseBranch: 'main',
          run: runner(),
        }),
      /No nope branch, locally or as origin\/nope/,
    );
  });
});

describe('resolveBase — stale copies of the base', () => {
  it('compares against whichever copy the branch left later', () => {
    const expected = {
      local: 'origin/main',
      origin: 'main',
      none: 'main',
      gone: 'origin/main',
    };

    for (const [behind, ref] of Object.entries(expected)) {
      const { repo, fork } = staleBaseRepo({ behind });
      const base = resolveBase(repo, {
        explicit: 'main',
        baseBranch: 'main',
        run: runner(),
        fetch: false,
      });
      assert.equal(base.ref, ref, `${behind} copy behind`);
      assert.equal(base.fork, fork, `${behind} copy behind`);
    }
  });
});

describe('stackParent', () => {
  it('finds the parent branch in a gh stack', () => {
    const run = (stack) => () => JSON.stringify(stack);

    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }, { name: 'b' }] }), '/', 'b'),
      'a',
    );
    assert.equal(
      stackParent(
        run([{ branch: 'a' }, { branch: 'b' }, { branch: 'c' }]),
        '/',
        'c',
      ),
      'b',
    );
    assert.equal(stackParent(run(['a', 'b']), '/', 'b'), 'a');
    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }] }), '/', 'a'),
      null,
    );
    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }] }), '/', 'z'),
      null,
    );
  });

  it('answers null when gh stack is not installed or the branch is in no stack', () => {
    const failing =
      (stderr, extra = {}) =>
      () => {
        throw Object.assign(new Error('Command failed'), { stderr, ...extra });
      };

    assert.equal(
      stackParent(failing('unknown command "stack" for "gh"'), '/', 'a'),
      null,
    );
    assert.equal(
      stackParent(
        failing('✗ current branch "a" is not part of a stack\n'),
        '/',
        'a',
      ),
      null,
    );
    assert.equal(stackParent(failing('', { code: 'ENOENT' }), '/', 'a'), null);
    assert.equal(
      stackParent(
        () =>
          'gh stack is available as an official extension.\nTo install it, run:\n  gh extension install github/gh-stack\n',
        '/',
        'a',
      ),
      null,
    );
    assert.equal(
      stackParent(() => '', '/', 'a'),
      null,
    );
  });

  it('stops rather than guess the base when the stack cannot be read', () => {
    assert.throws(
      () =>
        stackParent(
          () => {
            throw new Error('gh: authentication required');
          },
          '/',
          'a',
        ),
      /Could not read the stack .*authentication required.*pass --base <branch>/,
    );
    assert.throws(
      () => stackParent(() => 'not json', '/', 'a'),
      /Could not read the stack/,
    );
    assert.throws(
      () => stackParent(() => '{"stack":[]}', '/', 'a'),
      /shape this package cannot read.*pass --base <branch>/,
    );
  });
});

describe('skills base', () => {
  /**
   * Makes a repository the command can read its config in.
   *
   * @returns The repository path
   */
  function configured() {
    const { repo } = repoWith({ from: 'parent' });
    mkdirSync(join(repo, '.devkit'));
    writeFileSync(join(repo, '.devkit/skills.json'), '{ "skills": {} }\n');
    return repo;
  }

  it('prints shell assignments a skill can evaluate, quoting each value', () => {
    const resolved = {
      base: "it's",
      ref: 'origin/x',
      fork: 'abc',
      source: 'PR #1',
      warnings: [],
    };
    const assignments = baseAssignments(resolved);

    for (const shell of SHELLS) {
      assert.equal(
        runShell(
          shell,
          `eval "$(cat <<'EOF'\n${assignments}\nEOF\n)"\necho "$BASE_BRANCH|$BASE_REF|$FORK|$BASE_SOURCE"`,
          tmpdir(),
        ),
        "it's|origin/x|abc|PR #1",
        shell,
      );
    }
  });

  it('prints the base, passes warnings on, and exits 2 with the reason when it cannot decide', () => {
    const repo = configured();
    const out = [];
    const err = [];
    const io = { out: (line) => out.push(line), err: (line) => err.push(line) };

    assert.equal(baseCommand([], repo, io), 0);
    assert.match(out[0], /^BASE_BRANCH='parent'$/m);
    assert.match(out[0], /^BASE_SOURCE='the branch reflog'$/m);

    assert.equal(
      baseCommand([], repo, {
        ...io,
        resolve: () => ({
          base: 'main',
          ref: 'main',
          fork: 'abc',
          source: 'default branch',
          warnings: ['look out'],
        }),
      }),
      0,
    );
    assert.ok(err.includes('warning: look out'));

    assert.equal(baseCommand(['--base', 'nope'], repo, io), 2);
    assert.match(err.at(-1), /No nope branch/);

    assert.equal(baseCommand(['--base'], repo, io), 2);
    assert.match(err.at(-1), /Usage: skills base/);
  });

  it('treats an empty --base as no base given', () => {
    const repo = configured();
    const out = [];

    baseCommand(['--base', ''], repo, { out: (line) => out.push(line) });

    assert.match(out[0], /^BASE_BRANCH='parent'$/m);
  });

  it('prints JSON with --json', () => {
    const repo = configured();
    const out = [];

    baseCommand(['--json'], repo, { out: (line) => out.push(line) });

    assert.equal(JSON.parse(out[0]).base, 'parent');
  });
});
