// ============================================================================
// CLI
// ============================================================================
//
// Reads the command line and runs a whole-repo, path, branch, trace or init
// command, returning the exit code.

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { branchFindings } from './branch.mjs';
import {
  CONFIG_NAME,
  applyKnown,
  checkInclude,
  readConfig,
} from './config.mjs';
import { defaultBase } from './git.mjs';
import { analyse, trace } from './knip.mjs';
import {
  gitRoot,
  inside,
  isFolder,
  projectDir,
  real,
  repoPath,
} from './project.mjs';
import { formatJson, formatText } from './report.mjs';

const EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dead-code.example.json',
);

const COMMANDS = ['branch', 'why', 'init', 'help'];

/** The `--help` text. */
export const USAGE = `dead-code — knip, with known false positives set apart

Usage
  dead-code [paths...]            Dead code across the project, or only in the
                                  named files and folders
  dead-code branch [base]         Only what the branch newly left dead, compared
                                  with where it forked from base. Uncommitted
                                  changes count. The base defaults to origin/HEAD,
                                  then origin/main, origin/master, main, master.
  dead-code why <file> [export]   Trace what imports a file, or one export in it
  dead-code init [--force]        Write a starter .devkit/${CONFIG_NAME}

Paths are tried against the current folder, then against the repository root.
Every path printed is relative to the repository root.

Options
  --json                 Print a machine-readable report
  --include <types>      Knip issue types, comma-separated (files,exports,types)
  --workspace <ws>       Knip workspace, repeatable, replacing the config's list:
                         a folder (from the current folder if it exists there),
                         or a package name
  -h, --help             Show this text

Exit codes
  0  no findings beyond the known false positives
  1  findings
  2  a usage error, knip could not run or reported errors, or why found no
     such export

Known false positives live in .devkit/${CONFIG_NAME}, each with its reason.`;

/**
 * Counts the edits between two short words.
 *
 * @param a - One word
 * @param b - The other
 * @returns The Levenshtein distance
 */
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}

/**
 * Turns typed paths into git-root paths, with a warning for each one outside
 * the project, which can hold no findings.
 *
 * @param options - `{ root, cwd, prefix, paths }`
 * @returns `{ paths, warnings }`, `paths` empty when one is the whole project
 * @throws When a path does not exist
 */
function projectPaths({ root, cwd, prefix, paths }) {
  const out = [];
  const warnings = [];

  for (const [i, path] of paths.entries()) {
    let rel;
    try {
      ({ rel } = repoPath(root, cwd, path));
    } catch (error) {
      const near =
        i === 0 && /^[a-z]+$/.test(path)
          ? COMMANDS.find((c) => distance(c, path) <= 2)
          : null;
      if (near)
        throw new Error(
          `${path} is neither a command nor a path. Did you mean dead-code ${near}? See dead-code --help.`,
        );
      throw error;
    }

    // A path holding the whole project asks for the whole project.
    if (under(prefix, rel)) return { paths: [], warnings: [] };
    if (!under(rel, prefix))
      warnings.push(
        `${path} is outside the project folder ${prefix}, so it has no findings.`,
      );
    out.push(rel);
  }

  return { paths: out, warnings };
}

/**
 * Tells whether a path sits at or under a folder.
 *
 * @param file - A git-root path
 * @param folder - A git-root folder, `''` for the root
 * @returns True when it does
 */
function under(file, folder) {
  return folder === '' || file === folder || file.startsWith(`${folder}/`);
}

/**
 * Turns a typed workspace into one knip reads from the project folder, keeping
 * anything that is not a folder under the current one, such as a package name.
 *
 * @param ws - The workspace as typed
 * @param options - `{ cwd, dir }`, the current and project folders
 * @returns The project-relative folder, or the value unchanged
 * @throws When it names a folder outside the project
 */
function workspaceArg(ws, { cwd, dir }) {
  const full = isAbsolute(ws) ? ws : resolve(cwd, ws);
  if (!existsSync(full) || !statSync(full).isDirectory()) return ws;

  const rel = inside(dir, real(full));
  if (rel === null)
    throw new Error(`--workspace ${ws} is outside the project folder.`);
  return rel || '.';
}

/**
 * Rejects options a command does not take.
 *
 * @param command - The command's name
 * @param values - The parsed options
 * @param allowed - The options it takes
 * @throws When another one was given
 */
function onlyOptions(command, values, allowed) {
  for (const name of ['json', 'include', 'workspace', 'force'])
    if (values[name] !== undefined && !allowed.includes(name))
      throw new Error(`--${name} does not apply to dead-code ${command}.`);
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
 * Traces a file, or one export in it, and explains a file knip never reached.
 * Takes the git root, the current folder, the project folder and its path from
 * the git root, `<file> [export]`, and the workspace filters the user typed.
 *
 * @param options - `{ root, cwd, dir, prefix, args, workspaces }`
 * @returns The exit code: 2 when the export is not in the file
 * @throws When the file is missing, is a folder, or knip fails
 */
async function why({ root, cwd, dir, prefix, args, workspaces }) {
  if (args.length === 0 || args.length > 2)
    throw new Error(
      'Name one file, and optionally one export: dead-code why <file> [export]',
    );

  const { rel, full } = repoPath(root, cwd, args[0]);
  if (isFolder(full))
    throw new Error(
      `why takes a file, not a folder: ${args[0]}. Run dead-code ${args[0]} for the findings in a folder.`,
    );
  const file = inside(dir, full);
  if (file === null)
    throw new Error(
      `${args[0]} is outside the project folder ${prefix}, the one knip analyses.`,
    );

  const out = await trace({ cwd: dir, file, name: args[1], workspaces });

  if (/^No export .+ found in /m.test(out)) {
    process.stderr.write(out);
    return 2;
  }

  if (!/^File not found in module graph: /m.test(out)) {
    process.stdout.write(out);
    return 0;
  }

  // Knip says this of a README or an ignored file too, so check it is unused.
  const { findings } = await analyse({
    cwd: dir,
    prefix,
    workspaces,
    include: ['files'],
  });
  const unused = findings.some((f) => f.type === 'file' && f.file === rel);
  const verdict = unused
    ? `Nothing reaches ${rel}. No entry file imports it, directly or through other files, so all of it is unused.`
    : `Knip does not analyse ${rel}: it is not one of the project's source files${workspaces.length ? ' in the named workspaces' : ''}, or the knip config ignores it. That does not make it unused.`;

  process.stdout.write(
    out.replace(/^File not found in module graph: .+$/m, () => verdict),
  );
  return 0;
}

/**
 * Adds the warnings a report's own contents call for.
 *
 * @param result - The run's result
 * @returns The warnings to print, the run's own first
 */
function warningsFor({ warnings = [], hints, unresolved }) {
  const out = [...warnings];

  if (hints.some((h) => h.type.endsWith('-unconfigured')))
    out.push(
      'Knip looks unconfigured for this project: most files came back unused, so most findings are likely false. Follow the configuration hints first.',
    );
  if (unresolved.length)
    out.push(
      `${unresolved.length} import${unresolved.length === 1 ? '' : 's'} could not be resolved, so the files they point to may be reported unused when they are not. Fix the path alias, or install the missing package.`,
    );

  return out;
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

  const [command, ...rest] = positionals;
  if (values.help || command === 'help') {
    console.log(USAGE);
    return 0;
  }

  const root = gitRoot(cwd);
  if (command === 'init') {
    onlyOptions('init', values, ['force']);
    if (rest.length) throw new Error('init takes no arguments.');
    return init(root, Boolean(values.force));
  }
  if (command === 'why') onlyOptions('why', values, ['workspace']);
  else
    onlyOptions(command === 'branch' ? 'branch' : '[paths]', values, [
      'json',
      'include',
      'workspace',
    ]);

  const config = readConfig(root);
  const { dir, prefix } = projectDir(root, cwd, config.directory);
  const typed = (values.workspace ?? []).map((ws) =>
    workspaceArg(ws, { cwd, dir }),
  );
  const workspaces = values.workspace ? typed : config.workspaces;
  const include =
    values.include !== undefined
      ? checkInclude(
          values.include
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          '--include',
        )
      : config.include;

  // A file outside the config's workspaces would read as unreachable.
  if (command === 'why')
    return await why({ root, cwd, dir, prefix, args: rest, workspaces: typed });

  let result;
  if (command === 'branch') {
    if (rest.length > 1)
      throw new Error('Give at most one base: dead-code branch [base]');
    const base = rest[0] ?? defaultBase(root);
    const found = await branchFindings({
      root,
      dir,
      prefix,
      base,
      workspaces,
      include,
    });
    result = { ...found, mode: 'branch', base };
  } else {
    const { paths, warnings } = projectPaths({
      root,
      cwd,
      prefix,
      paths: positionals,
    });
    const found = await analyse({ cwd: dir, prefix, workspaces, include });
    result = {
      ...found,
      warnings,
      findings: paths.length
        ? found.findings.filter((f) => paths.some((p) => under(f.file, p)))
        : found.findings,
      mode: paths.length ? 'paths' : 'repo',
    };
  }

  const sorted = applyKnown(result.findings, config.known);
  // Only an unfiltered, error-free run sees everything a known entry could match.
  const complete =
    result.mode === 'repo' &&
    !values.include &&
    !values.workspace &&
    result.errors.length === 0;
  const report = {
    ...result,
    findings: sorted.findings,
    known: sorted.known,
    stale: complete ? sorted.stale : [],
    warnings: warningsFor(result),
    directory: prefix || '.',
  };

  console.log(values.json ? formatJson(report) : formatText(report));
  if (report.errors.length) return 2;
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
