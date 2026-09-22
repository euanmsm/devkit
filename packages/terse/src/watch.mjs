// ============================================================================
// Watch
// ============================================================================
//
// PostToolUse hook. Compares the working tree against the last commit and
// reports contract violations the agent has written by any route — a Bash
// heredoc, `sed -i`, a script — that the edit gate never sees.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '@euanmsm/devkit-core';

import { addedRanges } from './check.mjs';
import { config, governs, newFindings } from './scanner.mjs';

/** Runs git, returning null rather than throwing. */
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
  const tracked =
    git(root, 'diff', '--name-only', '--diff-filter=d', 'HEAD') ?? '';
  const untracked =
    git(root, 'ls-files', '--others', '--exclude-standard') ?? '';

  return [...tracked.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter(Boolean)
    .filter(governs);
}

/**
 * Finds contract violations one file has gained since the last commit.
 *
 * @param root - Repository root
 * @param file - Repo-relative path
 * @returns Findings the working copy adds
 */
function findingsFor(root, file) {
  const path = join(root, file);
  if (!existsSync(path)) return [];

  const after = readFileSync(path, 'utf8');
  const before = git(root, 'show', `HEAD:${file}`) ?? '';
  const patch = git(root, 'diff', '-U0', 'HEAD', '--', file);

  // An untracked file has no diff, so every line of it is new.
  const span = patch ? addedRanges(patch) : null;
  if (span && span.length === 0) return [];

  return newFindings(before, after, span);
}

/** Identifies a finding across runs, so one is reported once. */
function key(file, f) {
  return `${file}|${f.rule}|${f.message.replace(/\d+/g, '#')}`;
}

/** Where the set of already-reported findings lives, per session. */
function seenPath(root, session) {
  return join(root, '.git', 'terse', `seen-${session ?? 'default'}.json`);
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
  const fresh = [];

  for (const file of changedSinceCommit(root)) {
    for (const f of findingsFor(root, file)) {
      const id = key(file, f);
      if (seen.has(id)) continue;

      seen.add(id);
      fresh.push(`${file}:${f.line}  [${f.rule}]  ${f.message}`);
    }
  }

  if (fresh.length > 0) {
    mkdirSync(join(root, '.git', 'terse'), { recursive: true });
    writeFileSync(path, JSON.stringify([...seen]));
  }

  return fresh;
}

/** Builds the note the agent reads. */
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
