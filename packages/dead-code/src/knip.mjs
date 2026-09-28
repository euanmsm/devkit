// ============================================================================
// Knip
// ============================================================================
//
// Runs the knip bundled with this package and flattens its JSON report into
// one finding per unused file, export, type or dependency.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HINTS_REPORTER = join(
  dirname(fileURLToPath(import.meta.url)),
  'hints.mjs',
);

// Knip's issue keys mapped to the finding types this package reports.
const TYPES = {
  files: 'file',
  exports: 'export',
  nsExports: 'export',
  types: 'type',
  nsTypes: 'type',
  enumMembers: 'enumMember',
  duplicates: 'duplicate',
  dependencies: 'dependency',
  devDependencies: 'dependency',
  optionalPeerDependencies: 'dependency',
};

/**
 * Finds the knip bin this package depends on.
 *
 * @returns The bin's absolute path
 * @throws When knip is not installed
 */
export function knipBin() {
  const require = createRequire(import.meta.url);
  // Knip's exports map hides its package.json, so walk up from its entry.
  let dir = dirname(require.resolve('knip'));

  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.name === 'knip') {
        const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.knip;
        return join(dir, bin);
      }
    }

    const up = dirname(dir);
    if (up === dir) throw new Error('Could not find the knip package.');
    dir = up;
  }
}

/**
 * Runs knip with the current node.
 *
 * @param cwd - The directory knip analyses
 * @param args - Arguments after `knip`
 * @returns `{ status, stdout, stderr, error }`, once knip exits
 */
export function runKnip(cwd, args) {
  return new Promise((resolve) => {
    const out = [];
    const err = [];
    const child = spawn(process.execPath, [knipBin(), ...args], { cwd });

    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', (error) =>
      resolve({ status: null, stdout: '', stderr: '', error }),
    );
    child.on('close', (status) =>
      resolve({
        status,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
  });
}

/**
 * Builds the arguments shared by every analysis and trace.
 *
 * @param workspaces - Workspace filters, one `--workspace` each
 * @returns The arguments
 */
function workspaceArgs(workspaces) {
  return workspaces.flatMap((ws) => ['--workspace', ws]);
}

/**
 * Turns one knip issue entry into a finding.
 *
 * @param type - The finding's type
 * @param file - The repo-relative file the entry belongs to
 * @param item - The entry, a symbol or a group of symbols
 * @returns `{ type, file, name, line }`
 */
function toFinding(type, file, item) {
  if (Array.isArray(item))
    return {
      type,
      file,
      name: item.map((s) => s.name).join(', '),
      line: item[0]?.line ?? null,
    };

  if (type === 'file') return { type, file, name: file, line: null };

  const name =
    type === 'enumMember' && item.namespace
      ? `${item.namespace}.${item.name}`
      : item.name;
  return { type, file, name, line: item.line ?? null };
}

/**
 * Lists the symbols under one issue key, whichever shape knip gave them.
 *
 * @param value - An issue row's value for one key
 * @returns The entries, with knip 5's per-enum objects flattened
 */
function entries(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([namespace, members]) =>
    Array.isArray(members) ? members.map((m) => ({ namespace, ...m })) : [],
  );
}

/**
 * Flattens a knip JSON report into findings.
 *
 * @param report - Knip 5 or knip 6 JSON output, parsed
 * @returns One `{ type, file, name, line }` per issue
 */
export function toFindings(report) {
  const out = [];

  // Knip 5 lists unused files on their own, knip 6 inside each issue row.
  for (const file of report.files ?? [])
    if (typeof file === 'string')
      out.push({ type: 'file', file, name: file, line: null });

  for (const row of report.issues ?? []) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'file' || key === 'owners') continue;
      const type = TYPES[key] ?? key;
      for (const item of entries(value))
        out.push(toFinding(type, row.file, item));
    }
  }

  return out;
}

/**
 * Reads the JSON lines knip's reporters printed.
 *
 * @param stdout - Knip's standard output
 * @returns `{ report, hints }`, `report` null when no report was printed
 */
export function parseOutput(stdout) {
  let report = null;
  let hints = [];

  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (Array.isArray(value.hints)) hints = value.hints;
    else if ('issues' in value || 'files' in value) report = value;
  }

  return { report, hints };
}

/**
 * Runs knip over a tree and returns what it found.
 *
 * @param options - `{ cwd, workspaces, include }`, `cwd` being the tree's root
 * @returns `{ findings, hints }`, paths relative to `cwd`
 * @throws When knip exits with an error and prints no report
 */
export async function analyse({ cwd, workspaces = [], include }) {
  const result = await runKnip(cwd, [
    '--reporter',
    'json',
    '--reporter',
    HINTS_REPORTER,
    '--no-progress',
    '--no-exit-code',
    '--include',
    include.join(','),
    ...workspaceArgs(workspaces),
  ]);

  const { report, hints } = parseOutput(result.stdout ?? '');
  const detail = (result.stderr || result.stdout || '').trim();

  if (!report)
    throw new Error(
      `knip could not run${result.error ? ` (${result.error.message})` : ''}.\n\n${detail}`,
    );
  if (result.status !== 0 && detail)
    process.stderr.write(`knip reported errors:\n${detail}\n\n`);

  return { findings: toFindings(report), hints };
}

/**
 * Runs knip's trace for one file, or one export in it.
 *
 * @param options - `{ cwd, file, name, workspaces }`, `file` relative to `cwd`
 * @returns Knip's trace output
 * @throws When knip exits with an error
 */
export async function trace({ cwd, file, name, workspaces = [] }) {
  const result = await runKnip(cwd, [
    '--no-progress',
    '--trace-file',
    file,
    ...(name ? ['--trace-export', name] : []),
    ...workspaceArgs(workspaces),
  ]);

  if (result.status !== 0)
    throw new Error(
      `knip could not run.\n\n${(result.stderr || result.stdout || '').trim()}`,
    );
  return result.stdout;
}
