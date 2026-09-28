// ============================================================================
// Watch
// ============================================================================
//
// PostToolUse hook. Compares the working tree against the last commit and
// reports contract violations the agent has written by any route — a Bash
// heredoc, `sed -i`, a script — that the edit gate never sees.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { repoRoot } from '@euanmsm/devkit-core';

import { addedRanges } from './check.mjs';
import { config, governs, newFindings } from './scanner.mjs';

/**
 * Runs git, reporting a failure as null.
 *
 * @param root - The repository to run in
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout, or null when it failed
 */
function git(root, ...args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * Lists governed files the working tree has changed since the last commit.
 *
 * @param root - Repository root
 * @returns Repo-relative paths, tracked changes and new files alike
 */
export function changedSinceCommit(root) {
  // NUL-separated output leaves a path unquoted, whatever characters it holds.
  const tracked =
    git(root, 'diff', '--name-only', '-z', '--diff-filter=d', 'HEAD') ?? '';
  const untracked =
    git(root, 'ls-files', '-z', '--others', '--exclude-standard') ?? '';

  return [...tracked.split('\0'), ...untracked.split('\0')]
    .filter(Boolean)
    .filter(governs);
}

/**
 * Finds contract violations one file has gained since the last commit.
 *
 * @param root - Repository root
 * @param file - Repo-relative path
 * @returns Findings the working copy adds, each with the text of its line
 */
function findingsFor(root, file) {
  const path = join(root, file);
  if (!existsSync(path)) return [];

  const after = readFileSync(path, 'utf8');
  const before = git(root, 'show', `HEAD:${file}`) ?? '';
  const patch = git(
    root,
    'diff',
    '--no-color',
    '--no-ext-diff',
    '-U0',
    'HEAD',
    '--',
    file,
  );

  // An untracked file has no diff, so every line of it is new.
  const span = patch ? addedRanges(patch) : null;
  if (span && span.length === 0) return [];

  const lines = after.split('\n');

  return newFindings(before, after, span, file).map((f) => ({
    ...f,
    text: lines[f.line - 1]?.trim() ?? '',
  }));
}

/**
 * Identifies a finding across runs, so one is reported once.
 *
 * The line's text stands in for its number, which shifts as lines are added
 * above it.
 *
 * @param file - Repo-relative path the finding sits in
 * @param f - The finding, with the text of its line
 * @returns A key two runs of the same finding share
 */
function key(file, f) {
  return `${file}|${f.rule}|${f.message.replace(/\d+/g, '#')}|${f.text}`;
}

/**
 * Says where the set of already-reported findings lives.
 *
 * In a linked worktree or a submodule `.git` is a file pointing elsewhere, so
 * git is asked for the real directory.
 *
 * @param root - The repository
 * @param session - The Claude Code session id
 * @returns An absolute path
 */
function seenPath(root, session) {
  const gitDir =
    git(root, 'rev-parse', '--absolute-git-dir')?.trim() || join(root, '.git');
  return join(gitDir, 'terse', `seen-${session ?? 'default'}.json`);
}

/**
 * Reads the findings already reported this session.
 *
 * @param path - File the set is stored in
 * @returns Keys reported before now
 */
function readSeen(path) {
  try {
    return new Set(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return new Set();
  }
}

/**
 * Scans the working tree, returning only findings not yet reported.
 *
 * @param root - Repository root
 * @param session - The session id, keying the set of reported findings
 * @returns Lines naming each new violation
 */
export function unreported(root, session) {
  const path = seenPath(root, session);
  const seen = readSeen(path);
  const current = new Set();
  const fresh = [];

  for (const file of changedSinceCommit(root)) {
    const copies = new Map();

    for (const f of findingsFor(root, file)) {
      // Counting copies keeps a second identical finding from hiding behind the first.
      const base = key(file, f);
      const copy = copies.get(base) ?? 0;
      copies.set(base, copy + 1);

      const id = `${base}|${copy}`;
      current.add(id);
      if (seen.has(id)) continue;

      fresh.push(`${file}:${f.line}  [${f.rule}]  ${f.message}`);
    }
  }

  // Forgetting a fixed finding lets it be reported again if it comes back.
  const forgot = [...seen].some((id) => !current.has(id));

  // Failing to save only risks reporting a finding twice, never hiding one.
  if (fresh.length > 0 || forgot) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify([...current]));
    } catch {}
  }

  return fresh;
}

/**
 * Builds the note the agent reads.
 *
 * @param lines - One formatted finding per line
 * @returns The note's text
 */
export function format(lines) {
  const count = lines.length;
  const pointer = config.rulesDoc
    ? `\n\nThe rules are in ${config.rulesDoc}`
    : '';

  return (
    `terse — the working tree has gained ${count} comment-contract ` +
    `violation${count === 1 ? '' : 's'} that no edit gate saw:\n\n` +
    `${lines.map((l) => `  ${l}`).join('\n')}\n\n` +
    'Fix these before moving on. Deleting a comment is often the right fix.' +
    pointer
  );
}

/**
 * Builds the one line the user reads in the terminal.
 *
 * @param lines - Findings the working tree has gained
 * @returns A summary naming the count and the files
 */
export function summarise(lines) {
  const count = lines.length;
  const files = [...new Set(lines.map((l) => l.split(':')[0]))];
  const named = files.slice(0, 3).join(', ');
  const rest = files.length > 3 ? ` and ${files.length - 3} more` : '';

  return (
    `terse: ${count} new comment violation${count === 1 ? '' : 's'} ` +
    `in ${named}${rest}`
  );
}

/** Reads the hook payload and reports anything new the working tree has gained. */
export function main() {
  if (process.env.TERSE === 'off') return;

  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = repoRoot(input.cwd ?? process.cwd());

  // Without a commit to compare against, every line reads as newly written.
  if (!git(root, 'rev-parse', '--verify', 'HEAD')) return;

  const fresh = unreported(root, input.session_id);
  if (fresh.length === 0) return;

  // The agent reads the findings; the terminal gets a line saying it happened.
  process.stdout.write(
    JSON.stringify({
      systemMessage: summarise(fresh),
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: format(fresh),
      },
    }),
  );
}
