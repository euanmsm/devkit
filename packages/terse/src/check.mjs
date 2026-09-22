// ============================================================================
// Check Comments
// ============================================================================
//
// The CI half of the comment gate. Fails a pull request whose added lines break
// the contract, so existing debt in an untouched file never blocks a merge.

import { execFileSync } from 'node:child_process';

import { config, newFindings, governs } from './scanner.mjs';

// A missed rename reads a moved file's existing debt as new.
const RENAMES = '--find-renames=20%';

/** Runs git, throwing an error carrying its stderr. */
function run(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// `git show <base>:<file>` exits non-zero on a file the branch adds.
function git(...args) {
  try {
    return run(args);
  } catch {
    return null;
  }
}

/** Names the commit the branch diverged from, or null. */
export function mergeBase(base) {
  return git('merge-base', base, 'HEAD')?.trim() || null;
}

/** Lists in-scope files the diff touches. */
export function changedFiles(from) {
  return run(['diff', '--name-only', '--diff-filter=d', from, 'HEAD'])
    .split('\n')
    .map((f) => f.trim())
    .filter(governs);
}

/**
 * Reads the added-line ranges out of a unified diff.
 *
 * @param patch - `git diff -U0` output for one file
 * @returns One range per hunk, in head-side line numbers
 */
export function addedRanges(patch) {
  const ranges = [];

  for (const line of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/.exec(line);
    if (!hunk) continue;

    const from = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) ranges.push({ from, to: from + count - 1 });
  }

  return ranges;
}

/**
 * Maps each renamed path to what it was called at the base commit.
 *
 * @param from - The base commit
 * @returns New path to old path, for renames only
 */
export function renamedFrom(from) {
  const out = new Map();

  for (const line of run([
    'diff',
    '--name-status',
    RENAMES,
    from,
    'HEAD',
  ]).split('\n')) {
    const [code, old, now] = line.split('\t');
    if (code?.startsWith('R') && old && now) out.set(now, old);
  }

  return out;
}

/**
 * Reads every file's added-line ranges from one diff.
 *
 * @param from - The base commit
 * @param paths - Every path to diff, each renamed file's old name included
 * @returns Head-side path to its added ranges
 */
export function addedRangesByFile(from, paths) {
  const out = new Map();
  if (paths.length === 0) return out;

  let file = null;
  let hunks = [];

  for (const line of run([
    'diff',
    '-U0',
    RENAMES,
    from,
    'HEAD',
    '--',
    ...paths,
  ]).split('\n')) {
    const header = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (!header) {
      if (file) hunks.push(line);
      continue;
    }

    if (file) out.set(file, addedRanges(hunks.join('\n')));
    file = header[1];
    hunks = [];
  }

  if (file) out.set(file, addedRanges(hunks.join('\n')));

  return out;
}

/** Finds contract violations one file's diff introduces. */
function checkFile(file, from, renames, spans) {
  // A moved file's base version sits under its old path.
  const was = renames.get(file) ?? file;

  // Git quotes a header path holding a space, which the batched split misses.
  const span =
    spans.get(file) ??
    addedRanges(run(['diff', '-U0', RENAMES, from, 'HEAD', '--', was, file]));
  if (span.length === 0) return [];

  const before = git('show', `${from}:${was}`) ?? '';
  const after = run(['show', `HEAD:${file}`]);

  return newFindings(before, after, span);
}

export function main() {
  const base = process.argv[2] || 'origin/main';
  const from = mergeBase(base);

  if (!from) {
    console.error(
      `Could not find a merge base with ${base}. Fetch it, or pass one as an argument.`,
    );
    process.exit(1);
  }

  const files = changedFiles(from);
  const renames = renamedFrom(from);
  const spans = addedRangesByFile(from, [
    ...files,
    ...files.map((f) => renames.get(f) ?? f),
  ]);
  let total = 0;

  for (const file of files) {
    const found = checkFile(file, from, renames, spans);
    total += found.length;
    for (const f of found)
      console.log(`${file}:${f.line}  [${f.rule}]  ${f.message}`);
  }

  if (total === 0) {
    console.log(
      `No new comment-contract violations across ${files.length} changed file(s).`,
    );
    process.exit(0);
  }

  console.log(
    `\n${total} new violation(s) across ${files.length} changed file(s).`,
  );
  if (config.rulesDoc) console.log(`The rules are in ${config.rulesDoc}`);
  if (config.examplesDoc)
    console.log(`Paired examples are in ${config.examplesDoc}`);
  process.exit(1);
}
