// ============================================================================
// CLI
// ============================================================================
//
// Reads the command line and runs a whole-repo, path, branch, trace or init
// command, returning the exit code.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { repoRoot } from '@euanmsm/devkit-core';

import { branchFindings } from './branch.mjs';
import { CONFIG_NAME, applyKnown, readConfig } from './config.mjs';
import { analyse, trace } from './knip.mjs';
import { formatJson, formatText } from './report.mjs';

const EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dead-code.example.json',
);

/** The `--help` text. */
export const USAGE = `dead-code — knip, with known false positives set apart

Usage
  dead-code [paths...]            Dead code across the repo, or only in the named
                                  files and folders (relative to this folder)
  dead-code branch [base]         Only what the branch newly left dead, compared
                                  with where it forked from base (origin/main).
                                  Uncommitted changes count.
  dead-code why <file> [export]   Trace what imports a file, or one export in it
  dead-code init [--force]        Write a starter .devkit/${CONFIG_NAME}

Options
  --json                 Print a machine-readable report
  --include <types>      Knip issue types, comma-separated (files,exports,types)
  --workspace <ws>       Knip workspace, repeatable, replacing the config's list
  -h, --help             Show this text

Exit codes
  0  no findings beyond the known false positives
  1  findings
  2  a usage error, or knip could not run

Known false positives live in .devkit/${CONFIG_NAME}, each with its reason.`;

/**
 * Turns paths relative to a folder into repo-relative ones.
 *
 * @param root - The repository root
 * @param paths - Paths as typed
 * @param cwd - The folder they are relative to
 * @returns Repo-relative paths, `''` for the root itself
 * @throws When a path is outside the repository or does not exist
 */
function repoPaths(root, paths, cwd) {
  return paths.map((path) => {
    const full = resolve(cwd, path);
    const rel = relative(root, full);
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new Error(`${path} is outside the repository.`);
    if (!existsSync(full)) throw new Error(`${path} does not exist.`);
    return rel.split('\\').join('/');
  });
}

/**
 * Tells whether a file sits at or under one of the paths.
 *
 * @param file - A repo-relative file
 * @param paths - Repo-relative files and folders
 * @returns True when it matches one
 */
function under(file, paths) {
  return paths.some((p) => p === '' || file === p || file.startsWith(`${p}/`));
}

/**
 * Writes the example config into the repository.
 *
 * @param root - The repository root
 * @param force - True to replace an existing file
 * @returns The exit code
 */
function init(root, force) {
  const dir = join(root, '.devkit');
  const path = join(dir, CONFIG_NAME);

  if (existsSync(path) && !force) {
    console.error(
      `.devkit/${CONFIG_NAME} already exists. Pass --force to replace it, or edit it in place.`,
    );
    return 2;
  }

  mkdirSync(dir, { recursive: true });
  copyFileSync(EXAMPLE, path);
  console.log(
    `Wrote .devkit/${CONFIG_NAME}. Replace the example known entries with this repository's own.`,
  );
  return 0;
}

/**
 * Traces a file, or one export in it, and explains an unreachable file.
 *
 * @param root - The repository root
 * @param args - `<file> [export]`
 * @param cwd - The folder the file is relative to
 * @param workspaces - Workspace filters
 * @returns The exit code
 * @throws When the file is missing or knip fails
 */
async function why(root, args, cwd, workspaces) {
  if (args.length === 0 || args.length > 2)
    throw new Error(
      'Name one file, and optionally one export: dead-code why <file> [export]',
    );

  const [file] = repoPaths(root, [args[0]], cwd);
  const out = await trace({ cwd: root, file, name: args[1], workspaces });

  process.stdout.write(
    out.replace(
      /^File not found in module graph: (.+)$/gm,
      'Nothing reaches $1. No entry file imports it, directly or through other files, so all of it is unused.',
    ),
  );
  return 0;
}

/**
 * Parses the arguments and runs the command they name.
 *
 * @param argv - Arguments after the program name
 * @param cwd - The folder paths are relative to
 * @returns The exit code
 * @throws When the arguments or config are unusable, or knip fails
 */
async function dispatch(argv, cwd) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      include: { type: 'string' },
      workspace: { type: 'string', multiple: true },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const root = repoRoot(cwd);
  const [command, ...rest] = positionals;
  if (command === 'init') return init(root, Boolean(values.force));

  const config = readConfig(root);
  const workspaces = values.workspace ?? config.workspaces;
  const include = values.include
    ? values.include
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : config.include;

  if (command === 'why') return await why(root, rest, cwd, workspaces);

  let result;
  if (command === 'branch') {
    if (rest.length > 1)
      throw new Error('Give at most one base: dead-code branch [base]');
    const base = rest[0] ?? 'origin/main';
    const found = await branchFindings({ root, base, workspaces, include });
    result = { ...found, mode: 'branch', base };
  } else {
    const paths = repoPaths(root, positionals, cwd);
    const found = await analyse({ cwd: root, workspaces, include });
    result = {
      findings: paths.length
        ? found.findings.filter((f) => under(f.file, paths))
        : found.findings,
      hints: found.hints,
      mode: paths.length ? 'paths' : 'repo',
    };
  }

  const sorted = applyKnown(result.findings, config.known);
  // Only an unfiltered run sees everything a known entry could match.
  const complete =
    result.mode === 'repo' && !values.include && !values.workspace;
  const report = {
    ...result,
    findings: sorted.findings,
    known: sorted.known,
    stale: complete ? sorted.stale : [],
  };

  console.log(values.json ? formatJson(report) : formatText(report));
  return report.findings.length ? 1 : 0;
}

/**
 * Runs the CLI, printing any error plainly.
 *
 * @param argv - Arguments after the program name
 * @param cwd - The folder paths are relative to
 * @returns The exit code, 2 for any error
 */
export async function run(argv, cwd = process.cwd()) {
  try {
    return await dispatch(argv, cwd);
  } catch (error) {
    console.error(`dead-code: ${error.message}`);
    return 2;
  }
}
