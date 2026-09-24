// ============================================================================
// Shell Gate
// ============================================================================
//
// PreToolUse hook on Bash. Denies a command that writes a file in the
// repository, leaving the Edit and Write tools as the only way to change one.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
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
  const isInRepo = (target, index) =>
    isRepoPath(
      toAbsolutePath(target, resolveCwdAt(unquoted, index, cwd)),
      root,
    );

  return (
    findInPlaceEditor(bare) ??
    findRepoRedirect(unquoted, isInRepo) ??
    findRepoTee(unquoted, isInRepo) ??
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

// A heredoc opener such as `<<EOF`, `<<-'EOF'` or `<<"EOF"`, never a `<<<` here-string.
const HEREDOC = /(?<!<)<<-?\s*(['"]?)(\w+)\1/g;

/**
 * Removes heredoc bodies, keeping the command lines around them.
 *
 * @param command - The Bash command, verbatim
 * @returns The command with every heredoc body and closing delimiter dropped
 */
function stripHeredocs(command) {
  const kept = [];
  let delimiter = null;

  for (const line of command.split('\n')) {
    if (delimiter) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    kept.push(line);
    delimiter = [...line.matchAll(HEREDOC)].at(-1)?.[2] ?? null;
  }

  return kept.join('\n');
}

// ======== In-place editors ==================================================

const IN_PLACE_EDITORS = [
  { name: 'sed -i', pattern: /\bsed\b[^|;&\n]*\s(?:-[Enrsuz]*i|--in-place)/ },
  {
    name: 'perl -i',
    pattern: /\bperl\b[^|;&\n]*\s-[0lnpw]*i(?:\.\w*)?(?=\s|e\s|$)/,
  },
  { name: 'awk -i inplace', pattern: /\bg?awk\b[^|;&\n]*\s-i\s*inplace/ },
  {
    name: 'git apply',
    pattern: /\bgit\s+apply\b(?![^|;&\n]*--(?:check|stat|cached))/,
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

// `>` or `>>` and its target, skipping `>&2` duplication and `>(…)` process substitution.
const REDIRECT = /(?:^|[^<>])>>?\|?(?![&(])\s*([^\s<>|;&()]+)/g;

// `tee` and every argument after it, up to the next separator.
const TEE = /\btee\b((?:[ \t]+[^\s<>|;&()]+)+)/g;

/**
 * Finds a `>` or `>>` redirect whose target sits in the repository.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param isInRepo - Tells whether a target, at a position in the command, sits in the repository
 * @returns A description of the redirect, or null
 */
function findRepoRedirect(unquoted, isInRepo) {
  for (const { 1: target, index } of unquoted.matchAll(REDIRECT)) {
    if (isInRepo(target, index)) return `redirect into ${target}`;
  }
  return null;
}

/**
 * Finds a `tee` writing to a file in the repository.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param isInRepo - Tells whether a target, at a position in the command, sits in the repository
 * @returns A description of the tee, or null
 */
function findRepoTee(unquoted, isInRepo) {
  for (const { 1: args, index } of unquoted.matchAll(TEE)) {
    const files = args
      .trim()
      .split(/\s+/)
      .filter((arg) => !arg.startsWith('-'));
    const target = files.find((file) => isInRepo(file, index));
    if (target) return `tee into ${target}`;
  }
  return null;
}

// ======== Paths =============================================================

// A `cd` starting a command, and its target.
const CD = /(?:^|[;&|\n(])\s*cd\s+([^\s;&|()]+)/g;

/**
 * Works out the directory a command is in at a position, following each `cd` before it.
 *
 * @param unquoted - The command with shell operators blanked inside quotes
 * @param index - Position in the command
 * @param cwd - Directory the command starts in
 * @returns The directory, or null once a `cd` target cannot be resolved
 */
function resolveCwdAt(unquoted, index, cwd) {
  let dir = cwd;
  for (const match of unquoted.matchAll(CD)) {
    if (match.index > index) break;
    dir = toAbsolutePath(match[1], dir);
  }
  return dir;
}

/**
 * Resolves a path as written in a command.
 *
 * @param target - The path, possibly quoted or starting with `~`
 * @param cwd - Directory to resolve a relative path against, or null when unknown
 * @returns The absolute path, or null for a variable, a device or an unknown base
 */
function toAbsolutePath(target, cwd) {
  const path = target
    .replace(/^["']|["']$/g, '')
    .replace(/^~(?=\/|$)/, homedir());
  if (!path || path.includes('$') || path.startsWith('/dev/')) return null;
  if (isAbsolute(path)) return path;
  return cwd ? resolve(cwd, path) : null;
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
  return !rel.startsWith('..') && !isAbsolute(rel);
}

// ======== Inline scripts ====================================================

// An interpreter starting a command, or run through xargs.
const INTERPRETER =
  /(?:^|[|;&\n(]|\bxargs)\s*(?:python3?|node|ruby|bun|deno)\b/;

// A file-writing call in Node, Python or Ruby.
const WRITE_CALL =
  /\b(?:writeFile|appendFile)(?:Sync)?\b|\bcreateWriteStream\b|\bwrite_(?:text|bytes)\b|\bFile\.write\b|\bopen\([^)]*["'][wax]b?\+?["']/;

// An absolute path with at least one directory, not the tail of a URL or closing tag.
const ABSOLUTE_PATH = /(?<![\w.~$}/:<-])\/[\w.-]+\/[\w./-]*/g;

/**
 * Finds an inline Python, Node or Ruby script that writes a file in the repository.
 *
 * @param bare - The command with quoted text emptied
 * @param command - The Bash command, verbatim
 * @param root - Root of the repository the gate guards
 * @returns A description of the script, or null
 */
function findWritingScript(bare, command, root) {
  if (!INTERPRETER.test(bare) || !WRITE_CALL.test(command)) return null;
  if (mentionsPathOutside(command, root)) return null;
  return 'an inline script that writes a file';
}

/**
 * Tells whether a command names an absolute path outside the repository, such as a scratch directory.
 *
 * @param command - The Bash command, verbatim
 * @param root - Root of the repository the gate guards
 * @returns True when any such path appears
 */
function mentionsPathOutside(command, root) {
  return [...command.matchAll(ABSOLUTE_PATH)].some(
    ([path]) => !path.startsWith('/dev/') && !isRepoPath(path, root),
  );
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
