// ============================================================================
// Stale Base Repositories
// ============================================================================
//
// Real git repositories whose local base branch and origin copy disagree, for
// the tests that run a generated skill's base-resolving shell block.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's CLI, which a generated block reaches through `npx --no-install skills`. */
const SKILLS_BIN = fileURLToPath(new URL('../bin/skills.mjs', import.meta.url));

/**
 * Makes a repository with a `feat` branch cut from the newer of `main` and `origin/main`.
 *
 * @param options - `behind` names the copy left one commit back: `local`, `origin`, `none` for no origin copy, or `gone` for an origin copy and no local branch
 * @returns The repository path and the `fork` commit `feat` left the base at
 */
export function staleBaseRepo({ behind }) {
  const repo = mkdtempSync(join(tmpdir(), 'skills-base-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd: repo, encoding: 'utf8' },
    ).trim();
  const commit = (file) => {
    writeFileSync(join(repo, file), `${file}\n`);
    git('add', file);
    git('commit', '-q', '-m', file);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q', '-b', 'main');
  const old = commit('old.txt');
  const fork = commit('upstream.txt');

  if (behind === 'local') {
    git('update-ref', 'refs/remotes/origin/main', fork);
    git('update-ref', 'refs/heads/main', old);
  } else if (behind === 'origin') {
    git('update-ref', 'refs/remotes/origin/main', old);
  }

  git('switch', '-q', '-c', 'feat', fork);
  commit('mine.txt');

  if (behind === 'gone') {
    git('update-ref', 'refs/remotes/origin/main', fork);
    git('branch', '-q', '-D', 'main');
  }

  return { repo, fork };
}

/**
 * Runs a shell block in a repository.
 *
 * @param shell - `bash` or `zsh`
 * @param block - The shell source
 * @param cwd - The folder to run it in
 * @returns Its stdout, trimmed
 */
export function runShell(shell, block, cwd) {
  return execFileSync(shell, ['-c', block], { cwd, encoding: 'utf8' }).trim();
}

/** The shells a generated block must work in: bash always, zsh where it is installed. */
export const SHELLS = [
  'bash',
  ...(spawnSync('zsh', ['-c', 'true']).status === 0 ? ['zsh'] : []),
];

/**
 * Runs a generated shell block with `npx --no-install skills` pointed at this package's CLI.
 *
 * Any other `npx` command prints its arguments, one bracketed per argument.
 *
 * Writes a minimal `.devkit/skills.json` so the CLI can read the base branch.
 *
 * @param shell - `bash` or `zsh`
 * @param block - The shell source
 * @param cwd - The repository to run it in
 * @returns Its stdout, trimmed
 */
export function runWithSkills(shell, block, cwd) {
  mkdirSync(join(cwd, '.devkit'), { recursive: true });
  writeFileSync(join(cwd, '.devkit/skills.json'), '{ "skills": {} }\n');

  // Any other npx command prints its arguments instead of running.
  const npx = `npx() { if [ "$2" = skills ]; then shift 2; node '${SKILLS_BIN}' "$@"; else printf '[%s]' "$@"; echo; fi; }`;

  return runShell(shell, `${npx}\n${block}`, cwd);
}

/**
 * Makes a repository with a `child` branch stacked on a `parent` branch cut from `main`.
 *
 * `child` is created from `parent` by name, so its reflog records the parent.
 *
 * @returns The repository path and `parentHead`, the commit `child` left `parent` at
 */
export function stackedRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'skills-stack-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd: repo, encoding: 'utf8' },
    ).trim();
  const commit = (file) => {
    writeFileSync(join(repo, file), `${file}\n`);
    git('add', file);
    git('commit', '-q', '-m', file);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q', '-b', 'main');
  commit('base.txt');
  git('switch', '-q', '-c', 'parent');
  const parentHead = commit('parent.txt');
  git('branch', 'child', 'parent');
  git('switch', '-q', 'child');
  commit('child.txt');

  return { repo, parentHead };
}
