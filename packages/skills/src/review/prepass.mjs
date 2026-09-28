// ============================================================================
// Code Review Prepass
// ============================================================================
//
// Shell-side prework for a review. `split` breaks a branch diff into one patch
// per file. `tools` runs the repository's configured tools and the import
// graph together, landing each report atomically and a sentinel last.

import { execFile, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// A patch over 4000 lines is read file by file instead of whole.
const LARGE_DIFF_LINES = 4000;

/** Name of the sentinel file, which lands once every report has. */
export const SENTINEL = '_prepass.done.json';

/** How long one tool may run, just under the three minutes reviewers wait for the sentinel. */
export const TOOL_TIMEOUT_MS = 170_000;

// Exit codes a shell gives a command it could not find or could not execute.
const COULD_NOT_RUN = new Set([126, 127]);

// What npm prints when a script or an npx package is not there to run.
const NPM_COULD_NOT_RUN =
  /Missing script:|could not determine executable to run|npm (?:error|ERR!) code E404|npx canceled due to missing packages/;

// The most stderr a sentinel entry carries.
const STDERR_LIMIT = 2000;

/** Name of the import graph report. */
export const GRAPH_REPORT = '_import-graph.tmp.md';

/**
 * Names the report file a tool writes to.
 *
 * @param tool - The configured tool
 * @returns The file name inside the scratch directory
 */
export function reportName(tool) {
  return `_${tool.key}.tmp.${tool.json ? 'json' : 'txt'}`;
}

// =============================================================================
// Splitting the diff
// =============================================================================

// Pins every output setting the parser relies on, whatever the user's git config says.
const DIFF_ARGS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--no-ext-diff',
  '--no-color',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

/**
 * Writes one patch file per changed file, at `<out>/<path>.patch`.
 *
 * @param root - The repository root
 * @param options - `base`, `target`, and `out` relative to the root
 * @returns The summary the skill reads: `patchDir`, `files`, `unnamed`, `patchLines`, `largeDiff`
 */
export async function splitPatches(root, { base, target, out }) {
  const outDir = path.resolve(root, out);

  const { stdout } = await execFileAsync('git', [...DIFF_ARGS, base, target], {
    cwd: root,
    maxBuffer: 512 * 1024 * 1024,
  });

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // Splits on the header line, keeping it at the head of each chunk.
  const chunks = stdout
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith('diff --git '));

  const written = new Set();
  let unnamed = 0;

  for (const chunk of chunks) {
    const file = findChunkPath(chunk);
    const target = file && path.resolve(outDir, `${file}.patch`);

    // A path that would land outside the folder is as good as unnamed.
    if (!target?.startsWith(`${outDir}${path.sep}`)) {
      unnamed++;
      continue;
    }

    // Mirroring the tree keeps `a/b.ts` and `a_b.ts` apart.
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, chunk);
    written.add(target);
  }

  const patchLines =
    stdout === '' ? 0 : stdout.replace(/\n$/, '').split('\n').length;

  return {
    patchDir: path.relative(root, outDir),
    files: written.size,
    unnamed,
    patchLines,
    largeDiff: patchLines > LARGE_DIFF_LINES,
  };
}

/**
 * Finds the file path a single-file diff chunk touches.
 *
 * @param chunk - One `diff --git` chunk
 * @returns The path, or null when no header names one
 */
function findChunkPath(chunk) {
  // Only the header lines, so a `+++` inside the patch body is never read as one.
  const head = chunk.split(/^@@/m)[0];

  // The +++/--- lines keep a spaced name intact, with a trailing tab after it.
  const plus = headerPath(head, /^\+\+\+ (.+?)\t?$/m, 'b/');
  if (plus) return plus;

  const minus = headerPath(head, /^--- (.+?)\t?$/m, 'a/');
  if (minus) return minus;

  // A pure rename or copy has no ---/+++ lines, only these.
  const moved = headerPath(head, /^(?:rename|copy) to (.+)$/m, '');
  if (moved) return moved;

  // A binary file or a mode change has the header alone.
  const header = head.match(
    /^diff --git (?:a\/(.+) b\/(.+)|"a\/.*" "(b\/.*)")$/m,
  );
  if (header?.[2]) return header[2];
  if (header?.[3]) return unquote(`"${header[3]}"`).slice(2);

  return null;
}

/**
 * Reads one path out of a diff header line, unquoting it and dropping its prefix.
 *
 * @param head - The chunk's header lines
 * @param pattern - Captures the path as git printed it
 * @param prefix - The `a/` or `b/` prefix the path must carry, or empty for none
 * @returns The path, or null when the line is missing, names `/dev/null`, or lacks the prefix
 */
function headerPath(head, pattern, prefix) {
  const hit = head.match(pattern);
  if (!hit) return null;

  const raw = hit[1].startsWith('"') ? unquote(hit[1]) : hit[1];
  if (raw === '/dev/null' || !raw.startsWith(prefix)) return null;

  return raw.slice(prefix.length) || null;
}

// The escapes git uses inside a quoted path, beside octal bytes.
const ESCAPES = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
};

/**
 * Decodes a path git wrapped in double quotes, C-style.
 *
 * @param quoted - The path with its quotes, as git printed it
 * @returns The path as UTF-8 text
 */
function unquote(quoted) {
  const body = quoted.slice(1, -1);
  const bytes = [];

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      // Whole code points, so a character outside the BMP keeps both halves.
      const char = String.fromCodePoint(body.codePointAt(i));
      bytes.push(...Buffer.from(char, 'utf8'));
      i += char.length - 1;
      continue;
    }

    const octal = body.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[body[i + 1]] ?? body.charCodeAt(i + 1));
      i += 1;
    }
  }

  return Buffer.from(bytes).toString('utf8');
}

// =============================================================================
// The tool reports
// =============================================================================

/**
 * Runs every configured tool and the import graph in parallel into the scratch directory.
 *
 * @param root - The repository root
 * @param config - The resolved review config
 * @param options - `scratch` relative to the root, the `files` under review, the diff's `base` commit in diff mode, and `timeoutMs` per tool
 * @returns The sentinel's contents: each tool's `{ status, exitCode }`, the graph's status, and the file count
 */
export async function runTools(
  root,
  config,
  { scratch, files, base = null, timeoutMs = TOOL_TIMEOUT_MS },
) {
  const scratchDir = path.resolve(root, scratch);
  mkdirSync(scratchDir, { recursive: true });

  const tools = config.prepass.tools;
  const graphPath = path.join(scratchDir, GRAPH_REPORT);
  const sentinel = path.join(scratchDir, SENTINEL);

  const targets = [
    ...tools.map((tool) => path.join(scratchDir, reportName(tool))),
    graphPath,
    sentinel,
  ];

  // A leftover file from an earlier run reads as a completed report.
  for (const target of targets) {
    rmSync(target, { force: true });
    rmSync(`${target}.partial`, { force: true });
  }

  const graphJob = buildImportGraph(root, config, files)
    .then((markdown) => {
      landAtomically(graphPath, markdown);
      return 'ok';
    })
    .catch((err) => {
      landAtomically(
        graphPath,
        `# Import graph — unavailable\n\nThe generator failed: ${err.message}\n\nBuild the call sites needed with a grep.\n`,
      );
      return 'failed';
    });

  // A file the diff deleted is still in the list, and a tool cannot read it.
  const present = files.filter((file) => existsSync(path.join(root, file)));

  const results = await Promise.all([
    ...tools.map((tool) =>
      runTool(root, tool, { files: present, base }, scratchDir, timeoutMs),
    ),
    graphJob,
  ]);

  const status = Object.fromEntries(
    tools.map((tool, i) => [tool.key, results[i]]),
  );
  status.importGraph = results.at(-1);
  status.files = files.length;

  // Landing last makes its existence mean every report above has landed.
  landAtomically(sentinel, `${JSON.stringify(status, null, 2)}\n`);

  return status;
}

/**
 * Runs one configured tool, shaping its command and its output as the tool asks.
 *
 * @param root - The repository root
 * @param tool - The resolved tool
 * @param review - The `files` under review that still exist, and the diff's `base` commit or null
 * @param scratchDir - Absolute path of the scratch directory
 * @param timeoutMs - How long the tool may run before it is stopped
 * @returns The tool's `{ status, exitCode }`
 */
function runTool(root, tool, { files, base }, scratchDir, timeoutMs) {
  const finalPath = path.join(scratchDir, reportName(tool));
  const againstBase = Boolean(base && tool.baseCommand);

  if (!againstBase && tool.appendFiles && files.length === 0) {
    landAtomically(finalPath, '(no files under review for this tool)\n');
    return Promise.resolve({ status: 'ok', exitCode: null });
  }

  // Files go in as shell arguments; one long command string passes Linux's per-argument limit.
  const appendFiles = !againstBase && tool.appendFiles;
  const command = againstBase
    ? `${tool.baseCommand} ${shellQuote(base)}`
    : appendFiles
      ? `${tool.command} "$@"`
      : tool.command;

  const transform = tool.onlyFilesUnderReview
    ? (json) => keepFilesUnderReview(json, files)
    : null;

  return runCommand(root, command, finalPath, {
    args: appendFiles ? files : [],
    json: tool.json || tool.onlyFilesUnderReview,
    transform,
    errorExitCodes: tool.errorExitCodes ?? [],
    timeoutMs,
  });
}

/**
 * Quotes a path or ref for a POSIX shell.
 *
 * @param value - The path or ref
 * @returns The value in single quotes, with any single quote escaped
 */
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Cuts a knip-shaped JSON report down to the files under review.
 *
 * @param text - The report's JSON text
 * @param files - The files under review
 * @returns The trimmed JSON, with a count of the files left out, or the text unchanged when it does not parse
 */
export function keepFilesUnderReview(text, files) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return text;
  }

  const wanted = new Set(files);
  const trimmed = { ...report };
  let dropped = 0;

  // Knip 6 keys issues by file; knip 5 also lists unused files on their own.
  if (Array.isArray(report.issues)) {
    trimmed.issues = report.issues.filter((issue) => wanted.has(issue.file));
    dropped += report.issues.length - trimmed.issues.length;
  }
  if (Array.isArray(report.files)) {
    trimmed.files = report.files.filter((file) => wanted.has(file));
    dropped += report.files.length - trimmed.files.length;
  }

  trimmed.filesOutsideReview = dropped;

  return `${JSON.stringify(trimmed, null, 2)}\n`;
}

/**
 * Runs a shell command and lands its report at the given path.
 *
 * A tool exiting non-zero because it found something is `ok`. It is `failed`
 * when the shell could not find or execute it, npm has no such script or
 * package, it exits with a code the tool names as its own error, or a JSON tool
 * exits non-zero without printing JSON; and `timedOut` when it ran past the
 * timeout and was stopped.
 *
 * A JSON tool's report is the JSON on its stdout, even when it failed, so its
 * own account of the failure is kept; its stderr goes in the sentinel entry.
 * Any other report is stdout and stderr as they arrived.
 *
 * @param root - The repository root, used as the working directory
 * @param command - The shell command line
 * @param finalPath - The report file's path
 * @param options - `args` the command line reads as `"$@"`; `json` when the tool prints a JSON report; `transform` rewriting that JSON before it lands, or null; the tool's `errorExitCodes`; and `timeoutMs` before it is stopped
 * @returns The tool's `{ status, exitCode }`, with `stderr` for a JSON report, once its report has landed
 */
function runCommand(
  root,
  command,
  finalPath,
  { args = [], json, transform, errorExitCodes, timeoutMs },
) {
  return new Promise((resolve) => {
    const chunks = [];
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    const settle = (contents, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      landAtomically(finalPath, contents);
      resolve(result);
    };

    let child;
    try {
      child = spawn('/bin/sh', ['-c', command, 'sh', ...args], {
        cwd: root,
        // Its own process group, so a timeout stops everything it started.
        detached: true,
        // Nothing may wait on input the prepass will never give.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });
    } catch (err) {
      // A list past the system's argument limit makes spawn throw E2BIG, not emit `error`.
      landAtomically(
        finalPath,
        `prepass could not run: ${command}\n${err.message}\n`,
      );
      resolve({ status: 'failed', exitCode: null });
      return;
    }

    const text = (list) => Buffer.concat(list).toString('utf8');

    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The group had already exited.
      }
      settle(
        `prepass stopped \`${command}\`: it timed out after ${timeoutMs / 1000}s.\n\nOutput before it was stopped:\n${text(chunks) || '(none)\n'}`,
        { status: 'timedOut', exitCode: null },
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      chunks.push(chunk);
      stderrChunks.push(chunk);
    });

    child.on('error', (err) => {
      settle(`prepass could not run: ${command}\n${err.message}\n`, {
        status: 'failed',
        exitCode: null,
      });
    });

    child.on('close', (code) => {
      const raw = text(chunks);
      const report = json ? findJson(text(stdoutChunks)) : null;
      const failed =
        COULD_NOT_RUN.has(code) ||
        errorExitCodes.includes(code) ||
        (code !== 0 && NPM_COULD_NOT_RUN.test(raw)) ||
        (json && code !== 0 && report === null);

      if (report === null) {
        settle(raw || `(no output; exit ${code})\n`, {
          status: failed ? 'failed' : 'ok',
          exitCode: code,
        });
        return;
      }

      const stderr = text(stderrChunks).trim().slice(0, STDERR_LIMIT);
      settle(transform ? transform(report) : report, {
        status: failed ? 'failed' : 'ok',
        exitCode: code,
        ...(stderr ? { stderr } : {}),
      });
    });
  });
}

/**
 * Finds the JSON document in output that has other lines around it.
 *
 * @param raw - The tool's output
 * @returns The document with a trailing newline, or null when none parses
 */
function findJson(raw) {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let end = raw.lastIndexOf('}');

  for (let attempts = 0; end > start && attempts < 50; attempts++) {
    const candidate = raw.slice(start, end + 1);

    try {
      JSON.parse(candidate);
      return `${candidate}\n`;
    } catch {
      end = raw.lastIndexOf('}', end - 1);
    }
  }

  return null;
}

/**
 * Writes contents to a `.partial` sibling, then renames it into place.
 *
 * @param finalPath - The destination path
 * @param contents - The text to write
 */
function landAtomically(finalPath, contents) {
  const partial = `${finalPath}.partial`;
  writeFileSync(partial, contents);
  renameSync(partial, finalPath);
}

// =============================================================================
// The import graph
// =============================================================================

// Each pattern captures one exported name, matched line by line.
const EXPORT_PATTERNS = [
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:declare\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/,
];

// Matches `export { a, b as c }` — several names on one line.
const EXPORT_LIST = /^\s*export\s*(?:type\s*)?\{([^}]*)\}/;

// A one or two character name matches half the repository.
const MIN_SYMBOL_LENGTH = 3;

const MAX_SYMBOLS = 400;

const MAX_SITES_PER_SYMBOL = 40;

/**
 * Builds the markdown import graph for the source files in the list.
 *
 * @param root - The repository root
 * @param config - The resolved review config
 * @param files - Repository-relative paths under review
 * @returns The graph as markdown
 */
export async function buildImportGraph(root, config, files) {
  const { sources, searchGlobs } = config.prepass.graph;
  const codeFiles = files.filter((file) => sources.test(file));

  if (codeFiles.length === 0) {
    return '# Import graph — generated\n\n_No source files under review, so there is no graph to build._\n';
  }

  const symbols = collectExports(root, codeFiles);

  const names = [...new Set(symbols.map((symbol) => symbol.name))].filter(
    (name) => name.length >= MIN_SYMBOL_LENGTH,
  );
  const searched = names.slice(0, MAX_SYMBOLS);
  const truncated = names.length - searched.length;

  if (searched.length === 0) {
    return renderImportGraph(config, symbols, new Map(), truncated);
  }

  const stdout = await findCallSites(root, searched, searchGlobs);

  return renderImportGraph(
    config,
    symbols,
    groupCallSites(stdout, searched, symbols),
    truncated,
  );
}

/**
 * Collects every exported name in the files, with the line declaring it.
 *
 * @param root - The repository root
 * @param files - Repository-relative paths to scan
 * @returns One `{ name, file, line }` entry per export
 */
function collectExports(root, files) {
  const symbols = [];

  for (const file of files) {
    const abs = path.join(root, file);

    // A file the diff deleted is still named in the changed-file list.
    if (!existsSync(abs)) continue;

    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const line = index + 1;

        for (const pattern of EXPORT_PATTERNS) {
          const hit = text.match(pattern);
          if (hit) {
            symbols.push({ name: hit[1], file, line });
            return;
          }
        }

        const list = text.match(EXPORT_LIST);
        if (!list) return;

        for (const entry of list[1].split(',')) {
          // `b as c` is called `c` at every site outside this file.
          const parts = entry.trim().split(/\s+as\s+/);
          const name = (parts[1] ?? parts[0]).trim();

          if (/^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default') {
            symbols.push({ name, file, line });
          }
        }
      });
  }

  return symbols;
}

/**
 * Searches the repository with ripgrep for whole-word uses of the names.
 *
 * @param root - The repository root
 * @param names - The symbol names to search for
 * @param globs - The file globs to search in
 * @returns The raw `file:line:text` output, empty when nothing matched
 * @throws When ripgrep fails for any reason besides finding no match
 */
async function findCallSites(root, names, globs) {
  const args = [
    '--line-number',
    '--with-filename',
    '--no-heading',
    '--color=never',
    '--word-regexp',
    '--fixed-strings',
    ...globs.flatMap((glob) => ['-g', glob]),
    ...names.flatMap((name) => ['-e', name]),
    '.',
  ];

  try {
    const { stdout } = await execFileAsync('rg', args, {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    // rg exits 1 when nothing matched at all, which is an answer.
    if (err.code === 1) return '';
    throw err;
  }
}

/**
 * Groups ripgrep hits by symbol name, skipping each symbol's own declaration line.
 *
 * @param stdout - The raw ripgrep output
 * @param searched - The names that were searched
 * @param symbols - The collected exports
 * @returns A map from name to its `{ file, line }` sites
 */
function groupCallSites(stdout, searched, symbols) {
  const matchers = new Map(
    searched.map((name) => [name, new RegExp(`\\b${name}\\b`)]),
  );
  const sitesByName = new Map(searched.map((name) => [name, []]));
  const definitionKeys = new Set(
    symbols.map((symbol) => `${symbol.name} ${symbol.file} ${symbol.line}`),
  );

  for (const raw of stdout.split('\n')) {
    if (!raw) continue;

    const hit = raw.match(/^(.+?):(\d+):(.*)$/);
    if (!hit) continue;

    const file = hit[1].replace(/^\.\//, '');
    const line = Number(hit[2]);
    const text = hit[3];

    for (const [name, matcher] of matchers) {
      // `includes` rules out most lines before the regex runs.
      if (!text.includes(name)) continue;
      if (!matcher.test(text)) continue;
      if (definitionKeys.has(`${name} ${file} ${line}`)) continue;

      sitesByName.get(name).push({ file, line });
    }
  }

  return sitesByName;
}

/**
 * Builds the graph's opening explanation.
 *
 * @param config - The resolved review config, for what the graph misses
 * @returns The header markdown
 */
function graphHeader(config) {
  return `# Import graph — generated, not written by hand

Every exported symbol in the files under review, with the places that name
appears elsewhere in the repository.

**This is a superset with noise, and reading it as a verdict will mislead you.**
It matches on the NAME with word boundaries, so an unrelated local variable
sharing a name appears here, and an \`import\` line counts as a site. It also
under-reports ${config.prompts.graphUnderReports}, which will not appear at all.

Use it to skip the hunting, then confirm anything you rely on against the file.
"No call sites found" is a lead worth chasing, never a finding on its own.
`;
}

/**
 * Renders the graph markdown, listing symbols without outside sites as orphans.
 *
 * @param config - The resolved review config
 * @param symbols - The collected exports
 * @param sitesByName - The call sites keyed by name
 * @param truncatedSymbols - The count of names left unsearched
 * @returns The graph as markdown
 */
function renderImportGraph(config, symbols, sitesByName, truncatedSymbols) {
  const byFile = new Map();
  for (const symbol of symbols) {
    if (!byFile.has(symbol.file)) byFile.set(symbol.file, []);
    byFile.get(symbol.file).push(symbol);
  }

  let body = '';
  const orphans = [];

  for (const [file, fileSymbols] of byFile) {
    let section = '';

    for (const symbol of fileSymbols) {
      const sites = sitesByName.get(symbol.name) ?? [];
      const external = sites.filter((site) => site.file !== symbol.file);

      if (external.length === 0) {
        orphans.push(`\`${symbol.name}\` — ${symbol.file}:${symbol.line}`);
        continue;
      }

      section += renderSymbol(symbol, external);
    }

    if (section) body += `\n## ${file}\n${section}`;
  }

  const emptyBody =
    '\n_No exported symbols found in the files under review._\n';

  return `${graphHeader(config)}${body || emptyBody}${renderGraphTail(orphans, truncatedSymbols)}`;
}

/**
 * Renders one symbol's section, with its sites grouped by calling file.
 *
 * @param symbol - The export being rendered
 * @param sites - Its call sites outside the defining file
 * @returns The section as markdown
 */
function renderSymbol(symbol, sites) {
  const byCaller = new Map();
  for (const site of sites) {
    if (!byCaller.has(site.file)) byCaller.set(site.file, []);
    byCaller.get(site.file).push(site.line);
  }

  const callers = [...byCaller.entries()];
  const shown = callers.slice(0, MAX_SITES_PER_SYMBOL);
  const more = callers.length - shown.length;

  const lines = shown
    .map(([file, numbers]) => `- ${file}:${numbers.join(',')}`)
    .join('\n');

  return (
    `\n### \`${symbol.name}\` — defined at ${symbol.file}:${symbol.line}\n\n` +
    lines +
    (more > 0 ? `\n- _(${more} further file(s) not listed)_\n` : '\n')
  );
}

/**
 * Renders the orphan list and the truncation notice that close the graph.
 *
 * @param orphans - One formatted line per symbol without outside sites
 * @param truncatedSymbols - The count of names left unsearched
 * @returns The tail as markdown, empty when neither applies
 */
function renderGraphTail(orphans, truncatedSymbols) {
  let tail = '';

  if (orphans.length > 0) {
    tail += '\n---\n\n## No call sites found outside the defining file\n\n';
    tail +=
      'A name here is unused, referenced dynamically, or registered by\nname rather than imported. Check before calling it dead.\n\n';
    tail += orphans.map((orphan) => `- ${orphan}`).join('\n');
    tail += '\n';
  }

  if (truncatedSymbols > 0) {
    tail += `\n> **Truncated.** ${truncatedSymbols} further exported symbol(s) were not\n> searched — the target is over the ${MAX_SYMBOLS}-symbol cap for one sweep.\n`;
  }

  return tail;
}
