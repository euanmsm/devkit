// ============================================================================
// Scan
// ============================================================================
//
// `terse scan`. Checks whole files against the comment contract, every line of
// them, for a repository, a folder or a list of files.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { repoRoot } from '@euanmsm/devkit-core';

import { GUIDANCE, RULES, config, enabled, governs, scan } from './scanner.mjs';

/**
 * Reads the rule filter and the paths out of the command line.
 *
 * @param args - Arguments after `terse scan`
 * @returns `{ rules, paths }`, where an empty `rules` keeps every rule
 * @throws When an option is unknown or names a rule that cannot report
 */
export function parseArgs(args) {
  const rules = [];
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--rule' || arg.startsWith('--rule=')) {
      const name = arg === '--rule' ? args[++i] : arg.slice('--rule='.length);
      if (!name) throw new Error('--rule needs a rule name.');
      rules.push(checkRule(name));
      continue;
    }

    if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}.`);
    paths.push(arg);
  }

  return { rules, paths };
}

/**
 * Confirms a rule named on the command line can produce findings.
 *
 * @param name - The rule's name
 * @returns The name, unchanged
 * @throws When the rule is prose only, unknown, or switched off
 */
function checkRule(name) {
  if (GUIDANCE[name])
    throw new Error(`${name} is a prose-only rule, which no scan can check.`);
  if (!RULES[name])
    throw new Error(
      `No rule is called ${name}. The rules are: ${Object.keys(RULES).join(', ')}.`,
    );
  if (!enabled(name))
    throw new Error(`${name} is switched off in .devkit/terse.json.`);
  return name;
}

/**
 * Lists the files git knows about under one directory.
 *
 * @param root - Repository root
 * @param dir - Repo-relative directory, empty for the whole repository
 * @returns Repo-relative paths, tracked and untracked but not ignored
 */
function filesUnder(root, dir) {
  const out = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      dir || '.',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
  );

  return out.split('\0').filter(Boolean);
}

/**
 * Resolves the paths named on the command line to the files to scan.
 *
 * @param root - Repository root
 * @param paths - Files and directories, relative to the current directory
 * @param cwd - Directory the paths are relative to
 * @returns `{ files, skipped, missing }`, `files` repo-relative and governed
 */
export function targets(root, paths, cwd = process.cwd()) {
  const files = new Set();
  const skipped = [];
  const missing = [];

  for (const path of paths.length ? paths : [root]) {
    const full = resolve(cwd, path);
    const rel = relative(root, full);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      skipped.push({ path, reason: 'outside the repository' });
      continue;
    }
    if (!existsSync(full)) {
      missing.push(path);
      continue;
    }

    if (statSync(full).isDirectory()) {
      // A tracked file deleted from the working tree is still listed by git.
      for (const file of filesUnder(root, rel))
        if (governs(file) && existsSync(join(root, file))) files.add(file);
      continue;
    }

    if (governs(rel)) files.add(rel);
    else skipped.push({ path, reason: 'not governed by this config' });
  }

  return { files: [...files].sort(), skipped, missing };
}

/**
 * Pluralises a count.
 *
 * @param n - The count
 * @param word - The singular noun
 * @returns The count and the noun, together
 */
function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Builds the report a scan prints.
 *
 * @param results - `{ file, findings }` for each file with at least one finding
 * @param scanned - How many files the scan read
 * @param docs - The config's `rulesDoc` and `examplesDoc`
 * @returns Findings grouped by file, a count per rule, and a summary line
 */
export function report(results, scanned, docs = {}) {
  if (results.length === 0)
    return `No comment-contract violations across ${count(scanned, 'file')}.`;

  const groups = results.map(({ file, findings }) =>
    findings
      .map((f) => `${file}:${f.line}  [${f.rule}]  ${f.message}`)
      .join('\n'),
  );

  const totals = new Map();
  for (const { findings } of results)
    for (const f of findings) totals.set(f.rule, (totals.get(f.rule) ?? 0) + 1);

  const ranked = [...totals].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const width = Math.max(...ranked.map(([rule]) => rule.length));
  const byRule = ranked.map(([rule, n]) => `  ${rule.padEnd(width)}  ${n}`);

  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const pointers = [
    docs.rulesDoc && `The rules are in ${docs.rulesDoc}`,
    docs.examplesDoc && `Paired examples are in ${docs.examplesDoc}`,
  ].filter(Boolean);

  return [
    groups.join('\n\n'),
    `By rule\n${byRule.join('\n')}`,
    `${count(total, 'finding')} in ${results.length} of ${count(scanned, 'file')}.`,
    ...(pointers.length ? [pointers.join('\n')] : []),
  ].join('\n\n');
}

/**
 * Scans the named paths and exits non-zero on any finding.
 *
 * @param args - Arguments after `terse scan`
 */
export function main(args) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const root = repoRoot();
  const { files, skipped, missing } = targets(root, options.paths);
  const only = new Set(options.rules);
  const results = [];
  let unreadable = 0;

  for (const { path, reason } of skipped)
    console.error(`${path}  skipped, ${reason}`);
  for (const path of missing) console.error(`${path}  does not exist`);

  for (const file of files) {
    let source;
    // One bad path must not suppress the findings for every file after it.
    try {
      source = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      console.error(`${file}  could not be read — ${error.message}`);
      unreadable++;
      continue;
    }

    const findings = scan(source, file).filter(
      (f) => only.size === 0 || only.has(f.rule),
    );
    if (findings.length) results.push({ file, findings });
  }

  console.log(report(results, files.length, config));
  process.exit(results.length || unreadable || missing.length ? 1 : 0);
}
