// ============================================================================
// Shell Gate
// ============================================================================
//
// PreToolUse hook on Bash. Denies a command that writes a file in the
// repository, leaving the Edit and Write tools as the only way to change one.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { repoRoot } from '@euanmsm/devkit-core';

// =============================================================================
// Main Export
// =============================================================================

// A single- or double-quoted string, honouring backslash escapes inside double quotes.
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;

/**
 * Names the file edit a shell command makes inside the repository.
 *
 * @param command - The Bash command, verbatim
 * @param cwd - Directory the command runs in
 * @param root - Root of the repository the gate guards
 * @returns A short description of the edit, or null when the command makes none
 */
export function findShellEdit(command, cwd, root) {
  const shell = stripHeredocs(command);
  const bare = shell.replace(QUOTED, (quoted) => quoted[0].repeat(2));
  const unquoted = shell.replace(QUOTED, (quoted) =>
    quoted.replace(/[<>|;&]/g, ' '),
  );
  const cwdAt = trackCwd(unquoted, cwd);
  const { inCode } = scanSubshells(unquoted);
  const isInRepo = (target, index) =>
    isRepoPath(toAbsolutePath(target, cwdAt(index)), root);

  return (
    findInPlaceEditor(bare) ??
    findRepoRedirect(unquoted, inCode, isInRepo) ??
    findRepoTee(unquoted, inCode, isInRepo) ??
    findWritingScript(bare, command, root)
  );
}

/** Reads the hook payload and denies a command that edits a repository file. */
export function main() {
  if (process.env.SHELLGATE === 'off') allow();

  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') allow();

  const cwd = input.cwd ?? process.cwd();
  const root = repoRoot(process.env.CLAUDE_PROJECT_DIR ?? cwd);

  const edit = findShellEdit(command, cwd, root);
  if (!edit) allow();

  deny(formatDenial(edit));
}

// =============================================================================
// Helpers
// =============================================================================

// ======== Heredocs ==========================================================

// A heredoc opener such as `<<EOF`, `<<-'EOF'`, `<<\EOF` or `<<"END-DOC"`, read from a `<<`.
const HEREDOC = /<<-?\s*\\?(['"]?)([^\s'"<>|;&()]+)\1/y;

/**
 * Removes heredoc bodies, keeping the command lines around them.
 *
 * @param command - The Bash command, verbatim
 * @returns The command with every closed heredoc body and its closing delimiter dropped
 */
function stripHeredocs(command) {
  const lines = command.split('\n');
  const kept = [];
  const contexts = ['cmd'];

  for (let i = 0; i < lines.length; i++) {
    kept.push(lines[i]);
    for (const delimiter of findHeredocOpeners(lines[i], contexts)) {
      const end = lines.findIndex(
        (line, j) => j > i && line.trim() === delimiter,
      );
      // With no closing line the heredoc is not trusted, so its lines stay checked.
      if (end !== -1) i = end;
    }
  }

  return kept.join('\n');
}

/**
 * Finds the heredoc delimiters a line opens, skipping `<<` in quotes, comments and arithmetic.
 *
 * @param line - One line of the command
 * @param contexts - Stack of open quoting contexts, carried from line to line and updated in place
 * @returns The delimiters, in the order their bodies follow
 */
function findHeredocOpeners(line, contexts) {
  const delimiters = [];

  for (let i = 0; i < line.length; i++) {
    const context = contexts.at(-1);
    const char = line[i];

    if (context === "'") {
      if (char === "'") contexts.pop();
    } else if (context === "$'") {
      if (char === '\\') i++;
      else if (char === "'") contexts.pop();
    } else if (char === '\\') {
      i++;
    } else if (context === '"') {
      if (char === '"') {
        contexts.pop();
      } else if (char === '`') {
        contexts.push('`');
      } else if (line.startsWith('$((', i)) {
        contexts.push('((', '((');
        i += 2;
      } else if (line.startsWith('$(', i)) {
        contexts.push('(');
        i++;
      }
    } else if (context === '((') {
      if (char === '(') contexts.push('((');
      else if (char === ')') contexts.pop();
    } else if (char === '#' && /^$|[\s;&|()]/.test(line[i - 1] ?? '')) {
      break;
    } else if (char === "'" || char === '"') {
      contexts.push(char);
    } else if (line.startsWith("$'", i)) {
      contexts.push("$'");
      i++;
    } else if (char === '`') {
      if (context === '`') contexts.pop();
      else contexts.push('`');
    } else if (line.startsWith('$((', i) || line.startsWith('((', i)) {
      // Arithmetic, where `<<` is a shift: it counts as two nested parentheses.
      contexts.push('((', '((');
      i += char === '$' ? 2 : 1;
    } else if (char === '(') {
      contexts.push('(');
    } else if (char === ')') {
      if (context === '(') contexts.pop();
    } else if (line.startsWith('<<', i) && line[i - 1] !== '<') {
      HEREDOC.lastIndex = i;
      const opener = HEREDOC.exec(line);
      if (opener) delimiters.push(opener[2]);
      i = opener ? HEREDOC.lastIndex - 1 : i + 1;
    }
  }

  return delimiters;
}

// ======== In-place editors ==================================================

const IN_PLACE_EDITORS = [
  {
    name: 'sed -i',
    pattern: /\bsed\b[^|;&\n]*\s(?:-[EInrsuz]*[iI]|--in-place)/,
  },
  // Perl and Ruby read the rest of a flag after `i` as a backup suffix, as in `-pie` or `-i~`.
  {
    name: 'perl -i',
    pattern: /\bperl\b[^|;&\n]*\s-[\dalnpsw]*i(?:[.~][\w.~-]*|e)?(?=\s|$)/,
  },
  {
    name: 'ruby -i',
    pattern: /\bruby\b[^|;&\n]*\s-[acdlnpsvw]*i(?:[.~][\w.~-]*|e)?(?=\s|$)/,
  },
  {
    name: 'awk -i inplace',
    pattern: /\bg?awk\b[^|;&\n]*\s(?:-i\s*|--include[= ]\s*)inplace/,
  },
  {
    // `--apply` turns a read-only flag back into a write.
    name: 'git apply',
    pattern:
      /\bgit(?:\s+-[Cc]\s+\S+)*\s+apply(?=[\s|;&)]|$)(?![^|;&\n]*--cached)(?!(?![^|;&\n]*--apply\b)[^|;&\n]*--(?:check|stat|numstat|summary)\b)/,
  },
  { name: 'patch', pattern: /(?:^|[|;&\n(])\s*patch\b/ },
];

/**
 * Finds a tool that rewrites a file where it sits.
 *
 * @param bare - The command with quoted text emptied
 * @returns The editor's name, or null
 */
function findInPlaceEditor(bare) {
  return (
    IN_PLACE_EDITORS.find(({ pattern }) => pattern.test(bare))?.name ?? null
  );
}

// ======== Redirects and tee =================================================

// One shell word, keeping quoted strings and backslash-escaped characters, such as spaces, whole.
const WORD = String.raw`(?:"(?:[^"\\]|\\.)*"|'[^']*'|\\.|[^\s<>|;&()])+`;

// `>`, `>>` or `>&file` and its target, skipping `>&2` or `>&-` duplication and `>(…)` substitution.
const REDIRECT = new RegExp(
  String.raw`(?:^|[^<>])>>?\|?(?!\(|&\s*(?:\d+-?|-)(?![^\s<>|;&()]))&?\s*(${WORD})`,
  'g',
);

// An arithmetic `(( … ))` or a `[[ … ]]` test, whose `>` is a comparison.
const TEST = /\(\([^()]*\)\)|\[\[[^\n;]*?\]\]/g;

// `tee` and every argument after it, up to the next separator.
const TEE = new RegExp(String.raw`\btee\b((?:[ \t]+${WORD})+)`, 'g');

/**
 * Finds a `>` or `>>` redirect whose target sits in the repository.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param inCode - Whether each position is shell code rather than quoted text
 * @param isInRepo - Tells whether a target, at a position in the command, sits in the repository
 * @returns A description of the redirect, or null
 */
function findRepoRedirect(unquoted, inCode, isInRepo) {
  // A `$( … )` or backtick substitution inside a test still runs its redirects.
  const shell = unquoted.replace(TEST, (test, at) =>
    inCode[at] && !/\$\(|`/.test(test) ? test.replace(/[<>]/g, ' ') : test,
  );
  for (const { 1: target, index } of shell.matchAll(REDIRECT)) {
    if (isInRepo(target, index)) return `redirect into ${target}`;
  }
  return null;
}

/**
 * Finds a `tee` writing to a file in the repository.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param inCode - Whether each position is shell code rather than quoted text
 * @param isInRepo - Tells whether a target, at a position in the command, sits in the repository
 * @returns A description of the tee, or null
 */
function findRepoTee(unquoted, inCode, isInRepo) {
  for (const { 1: args, index } of unquoted.matchAll(TEE)) {
    if (!inCode[index]) continue;
    const files = [...args.matchAll(new RegExp(WORD, 'g'))]
      .map(([arg]) => arg)
      .filter((arg) => !arg.startsWith('-'));
    const target = files.find((file) => isInRepo(file, index));
    if (target) return `tee into ${target}`;
  }
  return null;
}

// ======== Paths =============================================================

// A `cd` starting a command, and its target.
const CD = new RegExp(String.raw`(?:^|[;&|\n(])\s*cd\s+(${WORD})`, 'g');

/**
 * Follows each `cd` in a command, to work out the directory it is in at a position.
 *
 * A `cd` in `( … )` or `$( … )`, even quoted, runs in a subshell, so stops counting once that closes.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param cwd - Directory the command starts in
 * @returns A function from a position in the command to its directory, or to null once a `cd` target cannot be resolved
 */
function trackCwd(unquoted, cwd) {
  const { parens, inCode } = scanSubshells(unquoted);
  const cds = [...unquoted.matchAll(CD)]
    .map((match) => ({
      at: match.index + match[0].length - match[1].length,
      target: match[1],
    }))
    .filter(({ at }) => inCode[at]);
  const steps = [...cds, ...parens].sort((a, b) => a.at - b.at);

  return (index) => {
    let dir = cwd;
    const outer = [];
    for (const { at, paren, target } of steps) {
      if (at > index) break;
      if (paren === '(') outer.push(dir);
      else if (paren === ')') dir = outer.length ? outer.pop() : dir;
      else dir = toAbsolutePath(target, dir);
    }
    return dir;
  };
}

/**
 * Finds where subshells open and close, including a `$( … )` inside double quotes.
 *
 * @param command - The command
 * @returns The parentheses that open or close a subshell, and whether each position is shell code rather than quoted text
 */
function scanSubshells(command) {
  const parens = [];
  const inCode = [];
  const contexts = ['cmd'];

  for (let i = 0; i < command.length; i++) {
    const context = contexts.at(-1);
    const char = command[i];
    inCode[i] = context === 'cmd' || context === '(';

    if (context === "'") {
      if (char === "'") contexts.pop();
    } else if (char === '\\') {
      inCode[i + 1] = inCode[i];
      i++;
    } else if (context === '"') {
      if (char === '"') {
        contexts.pop();
      } else if (command.startsWith('$(', i)) {
        contexts.push('(');
        parens.push({ at: i + 1, paren: '(' });
        inCode[i + 1] = true;
        i++;
      }
    } else if (char === "'" || char === '"') {
      contexts.push(char);
    } else if (char === '(') {
      contexts.push('(');
      parens.push({ at: i, paren: '(' });
    } else if (char === ')') {
      if (context === '(') contexts.pop();
      parens.push({ at: i, paren: ')' });
    }
  }

  return { parens, inCode };
}

/**
 * Resolves a path as written in a command.
 *
 * @param target - The path, possibly quoted, escaped or starting with `~`
 * @param cwd - Directory to resolve a relative path against, or null when unknown
 * @returns The absolute path, or null for a variable, a device or an unknown base
 */
function toAbsolutePath(target, cwd) {
  const path = unquote(target)
    .replace(/^["']|["']$/g, '')
    .replace(/^~(?=\/|$)/, homedir());
  if (!path || path.includes('$') || path.startsWith('/dev/')) return null;
  if (isAbsolute(path)) return path;
  return cwd ? resolve(cwd, path) : null;
}

/**
 * Removes the quotes and backslash escapes from a shell word.
 *
 * @param word - The word as written in the command
 * @returns The text the shell passes on
 */
function unquote(word) {
  return word.replace(
    /"((?:[^"\\]|\\.)*)"|'([^']*)'|\\(.)/g,
    (_, doubled, single, escaped) =>
      doubled?.replace(/\\(["\\$`])/g, '$1') ?? single ?? escaped,
  );
}

/**
 * Tells whether an absolute path sits inside the repository.
 *
 * @param absolute - The path, or null when unresolvable
 * @param root - Root of the repository the gate guards
 * @returns True for a repository path, false for anything else
 */
function isRepoPath(absolute, root) {
  if (!absolute) return false;
  const rel = relative(root, absolute);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// ======== Inline scripts ====================================================

// An interpreter binary, named without its directory.
const INTERPRETER = /^(?:python[\d.]*|node|ruby|bun|deno|tsx|ts-node)$/;

// Launchers that run the command after them, and the flags of each that take a value.
const LAUNCHERS = new Map([
  ['env', ['-u', '-C', '-S', '-P']],
  ['time', []],
  ['nice', ['-n']],
  ['nohup', []],
  ['command', []],
  ['exec', ['-a']],
  ['sudo', ['-u', '-g', '-C', '-D', '-p', '-r', '-t', '-U']],
  ['xargs', ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s']],
  ['timeout', ['-s', '-k']],
  ['npx', ['-p', '--package']],
  ['bunx', ['-p', '--package']],
]);

// Tools whose subcommand runs the command after it, such as `uv run`.
const RUNNERS = new Map([
  ['uv', /^run$/],
  ['poetry', /^run$/],
  ['pipenv', /^run$/],
  ['pdm', /^run$/],
  ['rye', /^run$/],
  ['hatch', /^run$/],
  ['pnpm', /^(?:exec|dlx)$/],
  ['yarn', /^(?:exec|dlx)$/],
]);

// Flags of a runner's subcommand that take a value.
const RUNNER_VALUE_FLAGS = [
  '-p',
  '--with',
  '--python',
  '--project',
  '--directory',
  '--package',
  '--env-file',
  '--extra',
  '--group',
];

// A file-writing call in Node, Bun, Deno, Python or Ruby.
const WRITE_CALL =
  /\b(?:writeFile|appendFile|writeTextFile)(?:Sync)?\b|\bcreateWriteStream\b|\bwrite_(?:text|bytes)\b|\b(?:File|Bun)\.write\b|\bopen(?:Sync)?\((?:[^()]|\([^()]*\))*["'](?:[wax]b?\+?|rb?\+)["']/;

// An absolute path with a directory, not a URL tail, closing tag or regex literal passed to a call.
const ABSOLUTE_PATH = /(?<![\w.~$}/:<(-])\/[\w.-]+\/[\w./-]*/g;

// Top-level directories a scratch path sits under, counted even on a machine without them.
const SCRATCH_ROOTS = new Set([
  'tmp',
  'private',
  'var',
  'Users',
  'home',
  'Volumes',
  'mnt',
  'opt',
  'root',
  'srv',
  'media',
]);

// The path of an interpreter or launcher binary, which says nothing about where a script writes.
const BINARY_PATH = new RegExp(
  String.raw`/bin/(?:python[\d.]*|node|ruby|bun|deno|tsx|ts-node|${[...LAUNCHERS.keys(), ...RUNNERS.keys()].join('|')})$`,
);

/**
 * Finds an inline Python, Node, Ruby, Bun or Deno script that writes a file in the repository.
 *
 * @param bare - The command with quoted text emptied
 * @param command - The Bash command, verbatim
 * @param root - Root of the repository the gate guards
 * @returns A description of the script, or null
 */
function findWritingScript(bare, command, root) {
  if (!runsInterpreter(bare) || !WRITE_CALL.test(command)) return null;
  if (mentionsPathOutside(command, root)) return null;
  return 'an inline script that writes a file';
}

/**
 * Tells whether any command in a line runs an interpreter, directly or behind launchers.
 *
 * @param bare - The command with quoted text emptied
 * @returns True when a command's first word, past `VAR=value` assignments and launchers, is an interpreter
 */
function runsInterpreter(bare) {
  return bare.split(/[|;&\n(]/).some((segment) => {
    const words = segment.trim().split(/\s+/);
    let i = 0;
    while (i < words.length) {
      const name = words[i].slice(words[i].lastIndexOf('/') + 1);
      if (/^\w+=/.test(words[i])) {
        i++;
      } else if (LAUNCHERS.has(name)) {
        // `command -v` and `command -V` only look a binary up.
        if (name === 'command' && /^-[vV]$/.test(words[i + 1])) return false;
        i = skipFlags(words, i + 1, LAUNCHERS.get(name));
        if (name === 'timeout' && /^[\d.]+[smhd]?$/.test(words[i])) i++;
      } else if (RUNNERS.get(name)?.test(words[i + 1] ?? '')) {
        i = skipFlags(words, i + 2, RUNNER_VALUE_FLAGS);
      } else {
        return INTERPRETER.test(name);
      }
    }
    return false;
  });
}

/**
 * Skips the flags after a launcher, with the value of each flag that takes one.
 *
 * @param words - The words of the command
 * @param start - Index of the first word after the launcher
 * @param valueFlags - Flags whose value is the next word
 * @returns Index of the first word past the flags
 */
function skipFlags(words, start, valueFlags) {
  let i = start;
  while (words[i]?.startsWith('-')) {
    i += valueFlags.includes(words[i]) ? 2 : 1;
  }
  return i;
}

/**
 * Tells whether a command names an absolute path outside the repository, such as a scratch directory.
 *
 * Only a path under a real top-level directory counts, so a URL path or regex literal does not.
 *
 * @param command - The Bash command, verbatim
 * @param root - Root of the repository the gate guards
 * @returns True when any such path appears
 */
function mentionsPathOutside(command, root) {
  return [...withoutRoot(command, root).matchAll(ABSOLUTE_PATH)].some(
    ([path]) =>
      !path.startsWith('/dev/') &&
      !BINARY_PATH.test(path) &&
      isFilesystemPath(path) &&
      !isRepoPath(path, root),
  );
}

/**
 * Replaces each mention of the repository root with `.`, so spaces or accents never cut it short.
 *
 * @param command - The Bash command, verbatim
 * @param root - Root of the repository the gate guards
 * @returns The command with the root, as written plainly or with escaped spaces, replaced
 */
function withoutRoot(command, root) {
  const spellings = [root, root.replaceAll(' ', '\\ ')].map((spelling) =>
    spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const mention = new RegExp(
    String.raw`(?<=^|[\s'"\`=(,;|&<>:[{])(?:${spellings.join('|')})(?=$|[/\s'"\`;|&<>(),:\]}])`,
    'g',
  );
  return command.replace(mention, '.');
}

/**
 * Tells whether an absolute path starts in a top-level directory a file could really be in.
 *
 * @param path - The absolute path
 * @returns True under a scratch root or a top-level directory that exists
 */
function isFilesystemPath(path) {
  const top = path.split('/')[1];
  return SCRATCH_ROOTS.has(top) || existsSync(`/${top}`);
}

// ======== Hook output =======================================================

/** Lets the tool call through. */
function allow() {
  process.exit(0);
}

/**
 * Blocks the tool call, showing the agent what to do instead.
 *
 * @param reason - The message the agent reads
 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/**
 * Builds the deny reason for a shell edit.
 *
 * @param edit - Description of the edit the command makes
 * @returns The message the agent reads
 */
function formatDenial(edit) {
  return (
    `BLOCKED — this command edits a file through the shell: ${edit}.\n\n` +
    `Files in this repository change only through the Edit and Write tools — never ` +
    `sed -i, perl -i, redirects, tee, git apply or an inline script. Make the ` +
    `change again with Edit or Write.`
  );
}
