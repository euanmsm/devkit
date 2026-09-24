// ============================================================================
// Workspace File
// ============================================================================
//
// Adds and removes worktree folders in a VS Code `.code-workspace` file. Edits
// are made to the text in place, keeping comments, formatting and every entry
// the tool does not own.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

// ============================================================================
// Editing
// ============================================================================

/**
 * Lists the folder entries in a workspace file's text.
 *
 * @param text - The workspace file's contents
 * @returns Each entry's path, name and character span
 * @throws When the text is not a JSON object with a `folders` array
 */
export function listFolders(text) {
  const folders = foldersArray(text);

  return folders.items.map((item) => {
    const value = item.type === 'object' ? toValue(text, item) : {};
    return {
      path: typeof value.path === 'string' ? value.path : null,
      name: typeof value.name === 'string' ? value.name : null,
      start: item.start,
      end: item.end,
    };
  });
}

/**
 * Adds a folder entry at the end of the `folders` array.
 *
 * @param text - The workspace file's contents
 * @param entry - The folder's `path` and optional `name`
 * @returns The new contents, unchanged when the path is already listed
 * @throws When the text is not a JSON object with a `folders` array
 */
export function addFolder(text, entry) {
  if (listFolders(text).some((f) => f.path === entry.path)) return text;

  const folders = foldersArray(text);
  const fields = Object.entries(entry).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  const json = `{ ${fields.join(', ')} }`;
  const close = folders.end - 1;
  const last = folders.items.at(-1);

  if (!last) {
    const indent = lineIndent(text, folders.start);
    const inner = indent + unit(text);
    return `${text.slice(0, folders.start + 1)}\n${inner}${json}\n${indent}${text.slice(close)}`;
  }

  const indent = lineIndent(text, last.start);
  // Matches the gap after the last entry up to and including its comma, if any.
  const gap = /^[ \t]*(\/\*[\s\S]*?\*\/[ \t]*)*,?/.exec(
    text.slice(last.end, close),
  )[0];
  const trailingComma = gap.endsWith(',');
  const afterComma = last.end + gap.length;

  // Matches the rest of the line when it holds only a comment.
  const rest = /^[ \t]*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)?[ \t]*(?=\n)/.exec(
    text.slice(afterComma),
  );
  const at = rest ? afterComma + rest[0].length : afterComma;
  const entryText = `\n${indent}${json}${trailingComma ? ',' : ''}`;

  if (trailingComma) return text.slice(0, at) + entryText + text.slice(at);
  return `${text.slice(0, last.end)},${text.slice(last.end, at)}${entryText}${text.slice(at)}`;
}

/**
 * Removes every folder entry a predicate picks.
 *
 * @param text - The workspace file's contents
 * @param pick - Called with each entry's path, true to remove it
 * @returns The new contents
 * @throws When the text is not a JSON object with a `folders` array
 */
export function removeFolders(text, pick) {
  const doomed = listFolders(text).filter((f) => f.path && pick(f.path));
  let out = text;

  for (const folder of doomed.reverse()) {
    let start = folder.start;
    let end = folder.end;
    const after = /^\s*,/.exec(out.slice(end));

    if (after) {
      end += after[0].length;
    } else {
      const before = /,\s*$/.exec(out.slice(0, start));
      if (before) start -= before[0].length;
    }

    const lineStart = out.lastIndexOf('\n', start - 1) + 1;
    if (/^[ \t]*$/.test(out.slice(lineStart, start))) start = lineStart - 1;

    out = out.slice(0, Math.max(start, 0)) + out.slice(end);
  }

  return out;
}

// ============================================================================
// Files
// ============================================================================

/**
 * Adds a worktree to a workspace file, creating the file when it is missing.
 *
 * @param file - The workspace file's absolute path
 * @param worktree - The worktree's absolute root
 * @param name - The worktree's name
 * @param main - The main checkout, listed first in a new file
 */
export function addWorktree(file, worktree, name, main) {
  const base = dirname(file);
  const entry = {
    name: `wt: ${name}`,
    path: toPosix(relative(base, worktree)),
  };

  if (!existsSync(file)) {
    const body = {
      folders: [{ path: toPosix(relative(base, main)) || '.' }, entry],
      settings: {},
    };
    writeFileSync(file, `${JSON.stringify(body, null, '\t')}\n`);
    return;
  }

  const text = readFileSync(file, 'utf8');
  const next = addFolder(text, entry);
  if (next !== text) writeFileSync(file, next);
}

/**
 * Removes one worktree's entry from a workspace file.
 *
 * @param file - The workspace file's absolute path
 * @param worktree - The worktree's absolute root
 */
export function removeWorktree(file, worktree) {
  if (!existsSync(file)) return;

  const base = dirname(file);
  const text = readFileSync(file, 'utf8');
  const next = removeFolders(text, (path) => resolve(base, path) === worktree);
  if (next !== text) writeFileSync(file, next);
}

/**
 * True when a path sits inside a folder.
 *
 * @param path - Any absolute path
 * @param folder - An absolute folder
 * @returns Whether the path is the folder or below it
 */
export function isInside(path, folder) {
  const rel = relative(folder, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Converts a path to forward slashes, the form workspace files use.
 *
 * @param path - Any relative path
 * @returns The path with forward slashes
 */
function toPosix(path) {
  return path.split(sep).join('/');
}

// ============================================================================
// JSONC Scanner
// ============================================================================

/**
 * Finds the `folders` array in the top-level object.
 *
 * @param text - The workspace file's contents
 * @returns The array node, with its items
 * @throws When the text is not a JSON object with a `folders` array
 */
function foldersArray(text) {
  const root = parse(text);
  if (root.type !== 'object')
    throw new Error('Workspace file is not a JSON object.');

  const folders = root.entries.find((e) => e.key === 'folders')?.value;
  if (folders?.type !== 'array')
    throw new Error('Workspace file has no "folders" array.');

  return folders;
}

/**
 * Parses one node's text into a plain value.
 *
 * @param text - The whole document
 * @param node - A node from the parser
 * @returns The node's value
 */
function toValue(text, node) {
  return JSON.parse(stripJsonc(text.slice(node.start, node.end)));
}

/**
 * Removes comments and trailing commas, leaving strict JSON.
 *
 * @param text - JSON with comments
 * @returns Plain JSON
 */
function stripJsonc(text) {
  // Matches a string to keep, or a comment or trailing comma to drop.
  const tokens =
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\/|,(?=(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*[}\]])/g;
  return text.replace(tokens, (_, string) => string ?? '');
}

/**
 * Finds the index just past a string's closing quote.
 *
 * @param text - The document
 * @param start - Index of the opening quote
 * @returns Index after the closing quote
 */
function stringEnd(text, start) {
  let i = start + 1;

  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '"') return i + 1;
    else i += 1;
  }

  return text.length;
}

/**
 * Reads the leading whitespace of the line a position sits on.
 *
 * @param text - The document
 * @param pos - Any index on the line
 * @returns The line's indentation
 */
function lineIndent(text, pos) {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start))[0];
}

/**
 * Guesses one indentation step from the document.
 *
 * @param text - The document
 * @returns A tab, or the smallest run of leading spaces
 */
function unit(text) {
  if (/^\t/m.test(text)) return '\t';

  const widths = [...text.matchAll(/^( +)\S/gm)].map((m) => m[1].length);
  return ' '.repeat(widths.length > 0 ? Math.min(...widths) : 2);
}

/**
 * Parses a JSON-with-comments document, recording where every value sits.
 *
 * @param text - The document
 * @returns The root node, with its type, span and children
 * @throws When the document is not valid JSON with comments
 */
function parse(text) {
  let pos = 0;

  const fail = (expected) => {
    throw new Error(
      `Workspace file does not parse: expected ${expected} at character ${pos}.`,
    );
  };

  const skip = () => {
    // Matches leading whitespace, a line comment or a block comment.
    const gap = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\//y;
    for (;;) {
      gap.lastIndex = pos;
      const match = gap.exec(text);
      if (!match) return;
      pos += match[0].length;
    }
  };

  const list = (close, item) => {
    pos += 1;
    for (;;) {
      skip();
      if (text[pos] === close) break;

      item();
      skip();
      if (text[pos] === ',') pos += 1;
      else if (text[pos] !== close) fail(`a comma or ${close}`);
    }
    pos += 1;
  };

  const value = () => {
    skip();
    const start = pos;

    if (text[start] === '{') {
      const entries = [];
      list('}', () => {
        if (text[pos] !== '"') fail('a key');
        const keyEnd = stringEnd(text, pos);
        const key = JSON.parse(text.slice(pos, keyEnd));
        pos = keyEnd;
        skip();
        if (text[pos] !== ':') fail('a colon');
        pos += 1;
        entries.push({ key, value: value() });
      });
      return { type: 'object', start, end: pos, entries };
    }

    if (text[start] === '[') {
      const items = [];
      list(']', () => items.push(value()));
      return { type: 'array', start, end: pos, items };
    }

    if (text[start] === '"') {
      pos = stringEnd(text, start);
      return { type: 'string', start, end: pos };
    }

    // Matches a number or a bare literal.
    const literal = /-?\d[\d.eE+-]*|true|false|null/y;
    literal.lastIndex = start;
    const match = literal.exec(text);
    if (!match) fail('a value');
    pos += match[0].length;
    return { type: 'literal', start, end: pos };
  };

  const root = value();
  skip();
  if (pos < text.length) fail('the end of the file');
  return root;
}
