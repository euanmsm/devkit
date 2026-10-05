// ============================================================================
// PR Prepass
// ============================================================================
//
// `skills pr prepass`: the facts about a branch that need no model — its base,
// its diff, which layers and sections it touches, the tests beside each
// changed file, who imports each one, its stories and the seed files to read.
// Writes them to the scratch folder and prints the workflow's args.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { splitPatches } from '../review/prepass.mjs';
import { TOUCHES } from './defaults.mjs';

/** The most importers listed for one file, so a shared module cannot flood the facts. */
const MAX_IMPORTERS = 30;

/** The changed files whose importers are searched for. */
const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte)$/;

const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/;

/** The rename similarity, in percent, at which a moved file counts as unchanged. */
const MOVE_SIMILARITY = 90;

/**
 * A changed line that only rewires an import or re-export, or is blank: the
 * kinds of edit a move forces on the files around it.
 */
const IMPORT_LINE = new RegExp(
  [
    String.raw`^\s*$`,
    String.raw`^\s*import\b`,
    String.raw`^\s*export\b.*\bfrom\s+['"]`,
    String.raw`^\s*\}\s*from\s+['"]`,
    String.raw`^\s*(type\s+)?[\w$]+(\s+as\s+[\w$]+)?,?\s*$`,
  ].join('|'),
);

// Pins the diff's output format, whatever the user's git config says.
const DIFF_ARGS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--no-ext-diff',
  '--no-color',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

// Unquoted, NUL-separated statuses and paths, with moves detected whatever diff.renames says.
const STATUS_ARGS = ['diff', '--name-status', '-z', '--find-renames'];

/**
 * Runs the prepass and returns the Workflow tool's args.
 *
 * @param root - The repository root
 * @param config - The resolved PR config
 * @param options - `scratch` folder, `baseBranch` from the shared settings, an optional `base` override, and `run`/`rg` stand-ins for tests
 * @returns The args, with the `headSha` publish checks against GitHub, or `{ ahead: 0, base, branch }` when the branch has nothing to open a PR for
 * @throws When the branch is detached or the base cannot be found
 */
export async function prPrepass(
  root,
  config,
  { scratch, baseBranch, base: override, run = runCommand, rg = ripgrep },
) {
  const git = (...args) => run('git', args, root);

  const branch = git('branch', '--show-current').trim();
  if (!branch) throw new Error('HEAD is detached; check out the branch first.');

  const base =
    override ??
    (config.base === 'stack'
      ? (stackParent(run, root, branch) ?? baseBranch)
      : baseBranch);
  try {
    // Offline, or with no remote, the refs already here have to do.
    git('fetch', '--quiet', 'origin', base);
  } catch {
    // Fall through to the refs on disk.
  }
  const baseRef = resolveRef(git, base);

  const ahead = Number(git('rev-list', '--count', `${baseRef}..HEAD`).trim());
  if (ahead === 0) return { ahead: 0, base, branch };

  const headSha = git('rev-parse', 'HEAD').trim();
  const mergeBase = git('merge-base', baseRef, 'HEAD').trim();
  const scratchDir = path.resolve(root, scratch);
  mkdirSync(scratchDir, { recursive: true });

  const diffPath = path.join(scratchDir, 'pr-qa-diff.tmp.patch');
  const diffText = git(...DIFF_ARGS, mergeBase, 'HEAD');
  writeFileSync(diffPath, diffText);

  const split = await splitPatches(root, {
    base: mergeBase,
    target: 'HEAD',
    out: path.join(scratchDir, 'pr-qa-patches'),
  });

  const { changed, added, deleted, moved } = parseNameStatus(
    git(...STATUS_ARGS, mergeBase, 'HEAD'),
  );
  const tracked = names(git('ls-files', '-z'));

  // A file moved out of a layer still touches it, so its old path counts too.
  const touched = classifyFiles(
    [...changed, ...deleted, ...moved.map(({ from }) => from)],
    config.layers,
  );
  const tests = testsBeside(changed, tracked, config.tests);
  const importers = findImporters(
    root,
    changed.filter(
      (file) => CODE_FILE.test(file) && !isTest(file, config.tests),
    ),
    rg,
  );
  const stories = config.storybook
    ? findStories(root, changed, tracked, {
        importers,
        match: config.storyMatch,
      })
    : [];
  const readFiles = tracked.filter((file) =>
    config.boot.read.some((glob) => globToRegExp(glob).test(file)),
  );

  const triage = triageHints({
    touched,
    layers: config.layers,
    questions: config.outsideRepo,
    files: [...changed, ...deleted, ...moved.map(({ from }) => from)],
    added,
    deleted,
    moved,
    importOnly: importOnlyFiles(diffText),
  });

  const factsPath = path.join(scratchDir, 'pr-qa-facts.tmp.md');
  writeFileSync(
    factsPath,
    renderFacts({
      branch,
      base,
      touched,
      deleted,
      moved,
      tests,
      importers,
      stories,
      readFiles,
      layers: config.layers,
      triage,
    }),
  );

  const diffStat = git(...DIFF_ARGS, '--stat', mergeBase, 'HEAD').trimEnd();

  return {
    branch,
    base,
    ahead,
    headSha,
    diffStat,
    diffPath,
    patchDir: path.join(scratchDir, 'pr-qa-patches'),
    factsPath,
    largeDiff: split.largeDiff,
    layers: Object.fromEntries(
      config.layers.map((layer) => [
        layer.key,
        touched.layers[layer.key].length > 0,
      ]),
    ),
    sections: touched.sections,
    triage,
    storyCount: stories.length,
    scratchDir,
    agentCap: agentCap(),
  };
}

/**
 * Finds the branch directly below this one in a `gh stack`.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param branch - The current branch
 * @returns The parent branch, or null when the branch is in no stack or at its bottom
 * @throws When `gh stack view` fails or answers in a shape it cannot read, since guessing the base would retarget a mid-stack PR
 */
export function stackParent(run, root, branch) {
  const override = 'pass --base <branch> to name the base yourself';
  let stack;

  try {
    stack = JSON.parse(run('gh', ['stack', 'view', '--json'], root));
  } catch (error) {
    const detail = String(error.stderr ?? '').trim() || error.message;
    if (/not (in|part of) a stack/i.test(detail)) return null;
    throw new Error(
      `Could not read the stack with \`gh stack view --json\` (${detail.split('\n')[0]}); ${override}.`,
    );
  }

  const list = Array.isArray(stack) ? stack : stack?.branches;
  if (!Array.isArray(list)) {
    throw new Error(
      `\`gh stack view --json\` answered in a shape this package cannot read; ${override}.`,
    );
  }

  const names = list.map((entry) =>
    typeof entry === 'string' ? entry : (entry?.name ?? entry?.branch),
  );
  const index = names.indexOf(branch);

  return index > 0 ? names[index - 1] : null;
}

/**
 * Finds the ref to diff against, preferring the remote branch GitHub diffs against.
 *
 * A local base branch is often weeks behind, and diffing against it would
 * pull every commit merged upstream since into the checklist.
 *
 * @param git - Runs git and returns its stdout
 * @param base - The base branch name
 * @returns A ref git can resolve
 * @throws When neither `origin/<branch>` nor the branch exists
 */
function resolveRef(git, base) {
  for (const ref of [`origin/${base}`, base]) {
    try {
      git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
      return ref;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `The base branch "${base}" does not exist locally or on origin.`,
  );
}

/**
 * Splits git's `-z` output into paths.
 *
 * @param stdout - NUL-separated paths
 * @returns The paths
 */
function names(stdout) {
  return stdout.split('\0').filter(Boolean);
}

/**
 * Reads git's `--name-status -z` output.
 *
 * @param stdout - NUL-separated statuses and paths
 * @returns The changed paths (a moved or copied file under its new path), the added paths, the deleted paths, and one `{ from, to, similarity }` per moved file
 */
export function parseNameStatus(stdout) {
  const fields = names(stdout);
  const changed = [];
  const added = [];
  const deleted = [];
  const moved = [];

  for (let i = 0; i < fields.length;) {
    const field = fields[i++];
    const status = field[0];

    if (status === 'R' || status === 'C') {
      const from = fields[i++];
      const to = fields[i++];
      changed.push(to);
      if (status === 'R') {
        moved.push({ from, to, similarity: Number(field.slice(1)) || 0 });
      }
    } else if (status === 'D') {
      deleted.push(fields[i++]);
    } else {
      const file = fields[i++];
      changed.push(file);
      if (status === 'A') added.push(file);
    }
  }

  return { changed, added, deleted, moved };
}

/**
 * Finds the files whose every changed line only rewires an import.
 *
 * @param diff - The branch's full diff
 * @returns The new paths of those files
 */
export function importOnlyFiles(diff) {
  const result = new Set();
  let file = null;
  let clean = true;

  const close = () => {
    if (file && clean) result.add(file);
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      close();
      file = /^diff --git a\/.+ b\/(.+)$/.exec(line)?.[1] ?? null;
      clean = true;
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    } else if (/^[+-]/.test(line) && !IMPORT_LINE.test(line.slice(1))) {
      clean = false;
    }
  }
  close();

  return result;
}

/**
 * Works out what a script can tell the triage about a diff.
 *
 * @param facts - The `touched` layers, the resolved `layers` and outside-the-repo `questions`, every changed, deleted or moved-from path as `files`, the `added`, `deleted` and `moved` lists, and the `importOnly` files
 * @returns What the diff `touches`, whether it may be a pure move, and the questions a changed path answers yes
 */
export function triageHints({
  touched,
  layers,
  questions,
  files,
  added,
  deleted,
  moved,
  importOnly,
}) {
  const touches = new Set();

  for (const layer of layers) {
    if (touched.layers[layer.key].length === 0) continue;
    // A layer that does not say what it needs could need anything.
    for (const touch of layer.touches ?? TOUCHES) touches.add(touch);
  }

  const movedTo = new Set(moved.map(({ to }) => to));
  const edited = files.filter(
    (file) =>
      !movedTo.has(file) &&
      !moved.some(({ from }) => from === file) &&
      !deleted.includes(file),
  );
  const pureMoveCandidate =
    moved.length > 0 &&
    added.length === 0 &&
    deleted.length === 0 &&
    moved.every(
      ({ to, similarity }) =>
        similarity >= MOVE_SIMILARITY || importOnly.has(to),
    ) &&
    edited.every((file) => importOnly.has(file));

  const outsideRepo = questions
    .map((question) => ({
      ask: question.ask,
      files: files.filter((file) =>
        question.paths.some((pattern) => matchesPath(pattern, file)),
      ),
    }))
    .filter((answer) => answer.files.length > 0);

  return {
    touches: TOUCHES.filter((touch) => touches.has(touch)),
    pureMoveCandidate,
    outsideRepo,
  };
}

/**
 * Sorts changed files into layers and sections.
 *
 * @param files - Repo-relative changed paths
 * @param layers - The resolved layers
 * @returns The files per layer key, whether each section is touched, and the files in no layer
 */
export function classifyFiles(files, layers) {
  const byLayer = Object.fromEntries(layers.map((layer) => [layer.key, []]));
  const sections = {};
  const unmatched = [];

  for (const layer of layers) sections[layer.section] ??= false;

  for (const file of files) {
    let matched = false;

    for (const layer of layers) {
      if (!layer.paths.some((pattern) => matchesPath(pattern, file))) continue;
      byLayer[layer.key].push(file);
      sections[layer.section] = true;
      matched = true;
    }

    if (!matched) unmatched.push(file);
  }

  return { layers: byLayer, sections, unmatched };
}

/**
 * Tells whether a path matches a layer pattern.
 *
 * @param pattern - A regex, or a path prefix string
 * @param file - A repo-relative path
 * @returns Whether it matches
 */
function matchesPath(pattern, file) {
  return pattern instanceof RegExp
    ? pattern.test(file)
    : file.startsWith(pattern);
}

/**
 * Tells whether a path is a test file.
 *
 * @param file - A repo-relative path
 * @param patterns - The test patterns
 * @returns Whether any pattern matches
 */
function isTest(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

/**
 * Finds the tests that sit beside each changed file.
 *
 * A test counts when it shares the file's name stem and sits in the same
 * folder, a `__tests__` folder beside it, or the changed file is itself a test.
 *
 * @param changed - Repo-relative changed paths
 * @param tracked - Every tracked path
 * @param patterns - The test patterns
 * @returns One `{ file, tests }` per changed non-test file, plus changed tests under their own name
 */
export function testsBeside(changed, tracked, patterns) {
  const testFiles = tracked.filter((file) => isTest(file, patterns));
  const result = [];

  for (const file of changed) {
    if (isTest(file, patterns)) {
      result.push({ file, tests: [file] });
      continue;
    }

    const dir = path.posix.dirname(file);
    const stem = stemOf(file);
    const tests = testFiles.filter((test) => {
      const testDir = path.posix.dirname(test);
      const nearby =
        testDir === dir ||
        testDir === `${dir}/__tests__` ||
        testDir.startsWith(`${dir}/__tests__/`);
      return nearby && stemOf(test) === stem;
    });

    result.push({ file, tests });
  }

  return result;
}

/**
 * Takes a file's name without its folder or any extensions.
 *
 * @param file - A path
 * @returns The stem, e.g. `route` for `api/route.api.test.ts`
 */
function stemOf(file) {
  return path.posix.basename(file).split('.')[0];
}

/**
 * Finds the story files for changed components, with their meta titles.
 *
 * @param root - The repository root
 * @param changed - Repo-relative changed paths
 * @param tracked - Every tracked path
 * @param options - The `importers` from `findImporters`, null when unsearched, and `match`: `stem` for a story beside the file with its name, `imports` for a story importing it, or `both`
 * @returns One `{ storyFile, title, component }` per story
 */
export function findStories(
  root,
  changed,
  tracked,
  { importers = null, match = 'both' } = {},
) {
  const stories = new Map();
  const storyFiles = tracked.filter((file) => STORY_FILE.test(file));

  for (const file of changed) {
    if (STORY_FILE.test(file)) {
      stories.set(file, file);
      continue;
    }

    if (match !== 'imports') {
      const dir = path.posix.dirname(file);
      const stem = stemOf(file);
      for (const story of storyFiles) {
        if (path.posix.dirname(story) === dir && stemOf(story) === stem) {
          stories.set(story, file);
        }
      }
    }

    if (match !== 'stem') {
      for (const importer of importers?.[file]?.all ?? []) {
        if (STORY_FILE.test(importer) && !stories.has(importer)) {
          stories.set(importer, file);
        }
      }
    }
  }

  return [...stories].map(([storyFile, component]) => ({
    storyFile,
    component,
    title: readStoryTitle(path.join(root, storyFile)),
  }));
}

/**
 * Reads the `title:` a story file's default export declares.
 *
 * @param file - Absolute path to the story file
 * @returns The title, or null when there is none to read
 */
function readStoryTitle(file) {
  try {
    const match = /\btitle:\s*(['"`])([^'"`]+)\1/.exec(
      readFileSync(file, 'utf8'),
    );
    return match ? match[2] : null;
  } catch {
    return null;
  }
}

/**
 * Finds the files importing each changed module, in one ripgrep pass.
 *
 * ripgrep finds every import whose specifier ends in a changed file's name;
 * each match then counts only when its path leads to that file. A relative
 * specifier must resolve to it, and an aliased or package one must end in its
 * path, not just its name.
 *
 * @param root - The repository root
 * @param files - Repo-relative changed code files
 * @param rg - Runs ripgrep with arguments and returns its stdout, or null when it is missing
 * @returns Per file, the first `importers`, how many `more` there are and `all` of them, or null when ripgrep is not installed
 */
export function findImporters(root, files, rg) {
  if (files.length === 0) return {};

  const targets = files.map((file) => ({ file, segments: importPath(file) }));
  const names = [...new Set(targets.map((target) => target.segments.at(-1)))];
  const pattern = `(from|import\\(|require\\()\\s*['"][^'"]*\\b(${names.map(escapeRegExp).join('|')})(\\.[a-z]+)?['"]`;

  const stdout = rg(
    [
      '--only-matching',
      '--with-filename',
      '--no-heading',
      '--no-line-number',
      '--null',
      '--no-messages',
      '-e',
      pattern,
      '.',
    ],
    root,
  );
  if (stdout === null) return null;

  const found = new Map(files.map((file) => [file, new Set()]));

  for (const line of stdout.split('\n')) {
    const split = line.indexOf('\0');
    if (split === -1) continue;

    const importer = line.slice(0, split).replace(/^\.\//, '');
    const specifier = /['"]([^'"]+)['"]/.exec(line.slice(split + 1))?.[1];
    if (!specifier) continue;

    for (const target of targets) {
      if (
        importer !== target.file &&
        importsTarget(importer, specifier, target.segments)
      ) {
        found.get(target.file).add(importer);
      }
    }
  }

  return Object.fromEntries(
    files.map((file) => {
      const importers = [...found.get(file)].sort();
      return [
        file,
        {
          importers: importers.slice(0, MAX_IMPORTERS),
          more: Math.max(0, importers.length - MAX_IMPORTERS),
          all: importers,
        },
      ];
    }),
  );
}

/**
 * Splits a module path into the segments an import of it would name.
 *
 * @param file - A repo-relative path or a resolved specifier
 * @returns Its segments with any extensions dropped, and a trailing `index` dropped
 */
function importPath(file) {
  const segments = path.posix.normalize(file).split('/');
  segments[segments.length - 1] = segments.at(-1).split('.')[0];
  if (segments.length > 1 && segments.at(-1) === 'index') segments.pop();
  return segments;
}

/**
 * Tells whether an import specifier names a changed module.
 *
 * @param importer - The importing file, repo-relative
 * @param specifier - The imported path as written
 * @param target - The changed module's import segments
 * @returns Whether a relative specifier resolves to it, or another specifier ends in its folder and name
 */
function importsTarget(importer, specifier, target) {
  if (specifier.startsWith('.')) {
    const resolved = importPath(
      path.posix.join(path.posix.dirname(importer), specifier),
    );
    return resolved.join('/') === target.join('/');
  }

  // `@/a/utils`, `~/a/utils` or `pkg/a/utils`: the first segment is the alias
  // or package. The rest must name the folder too, unless the file sits
  // directly under a top-level folder, where an alias names it alone.
  const tail = importPath(specifier).slice(1);
  return (
    tail.length >= Math.max(1, Math.min(2, target.length - 1)) &&
    tail.length <= target.length &&
    tail.join('/') === target.slice(-tail.length).join('/')
  );
}

/**
 * Escapes a string for use inside a regex.
 *
 * @param text - Any text
 * @returns The text with regex syntax escaped
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns a simple glob into a regex over repo-relative paths.
 *
 * @param glob - A glob using `*`, `**` and `?`
 * @returns The equivalent regex
 */
export function globToRegExp(glob) {
  let source = '';

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*' && glob[i + 1] === '*') {
      source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`^${source}$`);
}

/**
 * Writes the facts file every agent reads.
 *
 * @param facts - What the prepass found
 * @returns The facts file's markdown
 */
export function renderFacts({
  branch,
  base,
  touched,
  deleted,
  moved = [],
  tests,
  importers,
  stories,
  readFiles,
  layers,
  triage = null,
}) {
  const movedTo = new Map(moved.map(({ from, to }) => [from, to]));
  const list = (items, empty = '- (none)') =>
    items.length > 0 ? items.map((item) => `- \`${item}\``).join('\n') : empty;
  const layerList = (items) =>
    items
      .map((item) =>
        movedTo.has(item)
          ? `- \`${item}\` — moved to \`${movedTo.get(item)}\``
          : `- \`${item}\``,
      )
      .join('\n');

  const layerBlocks = layers
    .filter((layer) => touched.layers[layer.key].length > 0)
    .map(
      (layer) =>
        `### ${layer.title} (${layer.section} section)\n\n${layerList(touched.layers[layer.key])}`,
    );

  const testBlocks = tests.map(
    ({ file, tests: found }) =>
      `- \`${file}\` → ${found.length > 0 ? found.map((t) => `\`${t}\``).join(', ') : 'no test beside it'}`,
  );

  const importerBlocks =
    importers === null
      ? [
          'ripgrep (`rg`) is not installed, so importers were not searched. Find them yourself.',
        ]
      : Object.entries(importers).map(
          ([file, { importers: found, more }]) =>
            `- \`${file}\` ← ${found.length > 0 ? found.map((f) => `\`${f}\``).join(', ') : 'nothing imports it by name'}${more > 0 ? ` and ${more} more` : ''}`,
        );

  const sections = [
    `# PR QA facts — \`${branch}\` against \`${base}\``,
    'Written by `skills pr prepass`. Paths are exact; the lists are what a script could find, not a limit on where to look.',
    `## Changed files by layer\n\n${layerBlocks.join('\n\n') || '(no file matched a layer)'}`,
    `## Changed files in no layer\n\n${list(touched.unmatched)}`,
    `## Deleted files\n\n${list(deleted)}`,
    `## Moved files\n\n${
      moved
        .map(
          ({ from, to, similarity }) =>
            `- \`${from}\` → \`${to}\`${similarity ? ` (${similarity}% similar)` : ''}`,
        )
        .join('\n') || '- (none)'
    }`,
    `## Tests beside each changed file\n\n${testBlocks.join('\n') || '- (none)'}`,
    `## Importers of each changed module\n\n${importerBlocks.join('\n') || '- (none)'}`,
  ];

  if (stories.length > 0) {
    sections.push(
      `## Stories for changed components\n\n${stories
        .map(
          (story) =>
            `- \`${story.storyFile}\` — title ${story.title ? `\`${story.title}\`` : 'not found; read the file'} — for \`${story.component}\``,
        )
        .join('\n')}`,
    );
  }

  sections.push(`## Seed, fixture and env files to read\n\n${list(readFiles)}`);

  if (triage) {
    const answers = triage.outsideRepo.map(
      (answer) =>
        `- Yes: ${answer.ask} (${answer.files.map((f) => `\`${f}\``).join(', ')})`,
    );
    sections.push(
      [
        '## Triage hints\n',
        `- Needs running to test: ${triage.touches.join(', ') || 'nothing'}`,
        `- Pure move candidate: ${triage.pureMoveCandidate ? 'yes — every change is a rename or an import rewiring' : 'no'}`,
        ...answers,
      ].join('\n'),
    );
  }

  return `${sections.join('\n\n')}\n`;
}

/**
 * Picks how many agents the workflow may run at once.
 *
 * @returns Two fewer than the cores, between 4 and 16
 */
function agentCap() {
  return Math.min(16, Math.max(4, availableParallelism() - 2));
}

/**
 * Runs a command and returns its stdout.
 *
 * @param command - The program
 * @param args - Its arguments
 * @param cwd - The working directory
 * @returns The stdout text
 * @throws When the command exits non-zero
 */
function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Runs ripgrep, treating "no matches" as an empty result.
 *
 * @param args - ripgrep's arguments
 * @param cwd - The working directory
 * @returns The stdout, or null when ripgrep is not installed
 * @throws When ripgrep fails for any other reason, such as a bad pattern
 */
export function ripgrep(args, cwd) {
  try {
    return runCommand('rg', args, cwd);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.status === 1) return '';
    // Exit 2 with a silent stderr: --no-messages hid unreadable paths, so keep the matches.
    if (error.status === 2 && !error.stderr?.trim()) return error.stdout;
    throw error;
  }
}
