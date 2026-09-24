// ============================================================================
// Supabase Override Project
// ============================================================================
//
// Builds the gitignored `.wt-supabase/supabase/` folder a worktree's Supabase
// CLI runs against: a port-shifted copy of `config.toml` plus symlinks.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** The gitignored folder holding a worktree's Supabase override project. */
export const OVERRIDE_DIR = '.wt-supabase';

// Each entry is one port the stack binds, as an offset from the slot's base.
const PORTS = [
  { section: 'api', key: 'port', add: 1 },
  { section: 'db', key: 'port', add: 2 },
  { section: 'db', key: 'shadow_port', add: 0 },
  { section: 'studio', key: 'port', add: 3 },
  { section: 'inbucket', key: 'port', add: 4 },
  { section: 'inbucket', key: 'smtp_port', add: 5, onlyIfPresent: true },
  { section: 'analytics', key: 'port', add: 7 },
  { section: 'db.pooler', key: 'port', add: 9, onlyIfPresent: true },
];

// Matches a table header such as `[db.pooler]`, not an array of tables.
const HEADER = /^\s*\[([^[\]]+)\]\s*(#.*)?$/;

// ============================================================================
// Building
// ============================================================================

/**
 * Finds the first port of a slot's Supabase range.
 *
 * @param sb - The config's `supabase` block
 * @param slot - The worktree's slot
 * @returns The range's first port
 */
export function basePortFor(sb, slot) {
  return sb.basePort + slot * sb.step;
}

/**
 * Lists the old-to-new pairs for every port in the Supabase range.
 *
 * @param sb - The config's `supabase` block
 * @param slot - The worktree's slot
 * @returns Pairs of main-checkout port and worktree port
 */
export function supabaseMappings(sb, slot) {
  const base = basePortFor(sb, slot);
  return Array.from({ length: 10 }, (_, k) => [sb.basePort + k, base + k]);
}

/**
 * Writes a worktree's override project.
 *
 * @param worktree - The worktree's root
 * @param sb - The config's `supabase` block
 * @param slot - The worktree's slot
 * @param appPort - The worktree's app port, or null for no auth URLs
 * @returns The stack's project id and ports, or null with no tracked config
 */
export function buildProject(worktree, sb, slot, appPort) {
  const tracked = join(worktree, sb.dir, 'config.toml');
  if (!existsSync(tracked)) return null;

  const out = join(worktree, OVERRIDE_DIR, 'supabase');
  mkdirSync(out, { recursive: true });

  for (const name of sb.link) {
    const source = join(worktree, sb.dir, name);
    const link = join(out, name);
    if (!existsSync(source)) continue;

    rmSync(link, { force: true, recursive: true });
    symlinkSync(relative(dirname(link), source), link);
  }

  const base = basePortFor(sb, slot);
  const config = patchConfig(readFileSync(tracked, 'utf8'), {
    slot,
    base,
    appPort,
  });
  writeFileSync(join(out, 'config.toml'), config);

  return {
    projectId: readProjectId(config),
    api: base + 1,
    db: base + 2,
    studio: base + 3,
  };
}

/**
 * Picks the `--workdir` the Supabase CLI needs in a checkout.
 *
 * @param root - The checkout's root
 * @param sb - The config's `supabase` block
 * @returns The workdir, relative to the root
 */
export function workdir(root, sb) {
  if (existsSync(join(root, OVERRIDE_DIR, 'supabase', 'config.toml'))) {
    return OVERRIDE_DIR;
  }
  return dirname(sb.dir);
}

/**
 * Reads the first `project_id`, ignoring any under `[remotes.*]`.
 *
 * @param text - A `config.toml`'s contents
 * @returns The project id, or null
 */
export function readProjectId(text) {
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(text);
  return match ? match[1] : null;
}

// ============================================================================
// Patching
// ============================================================================

/**
 * Shifts a tracked `config.toml` into a slot's port range.
 *
 * @param text - The tracked config's contents
 * @param options - The `slot`, its `base` port and the `appPort` or null
 * @returns The patched config
 */
export function patchConfig(text, { slot, base, appPort }) {
  let out = text;
  const id = readProjectId(out);

  if (id) out = setKey(out, null, 'project_id', `"${id}-wt${slot}"`);

  for (const { section, key, add, onlyIfPresent } of PORTS) {
    out = setKey(out, section, key, String(base + add), { onlyIfPresent });
  }

  if (appPort) {
    const urls = [
      `http://127.0.0.1:${appPort}/**`,
      `http://localhost:${appPort}/**`,
    ];
    const current = getValue(out, 'auth', 'additional_redirect_urls') ?? '';
    const kept = [...current.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const merged = [...new Set([...kept, ...urls])].map((u) => `"${u}"`);

    out = setKey(out, 'auth', 'site_url', `"http://127.0.0.1:${appPort}"`);
    out = setKey(
      out,
      'auth',
      'additional_redirect_urls',
      `[${merged.join(', ')}]`,
    );
  }

  return out;
}

/**
 * Finds the line span of a table, or of the top-level keys for null.
 *
 * @param lines - The config's lines
 * @param section - A table name, or null for the top level
 * @returns The header's index and the index past the table's last line
 */
function tableSpan(lines, section) {
  let header = section === null ? -1 : null;

  for (let i = 0; i < lines.length; i++) {
    const match =
      HEADER.exec(lines[i]) ?? (/^\s*\[\[/.test(lines[i]) ? [] : null);
    if (!match) continue;

    if (header !== null) return { header, end: i };
    if (match[1]?.trim() === section) header = i;
  }

  return header === null ? null : { header, end: lines.length };
}

/**
 * Finds a key's lines in a table, following a multi-line array to its end.
 *
 * @param lines - The config's lines
 * @param span - The table's span
 * @param key - The key
 * @returns The first and past-the-last line index, or null when absent
 */
function keySpan(lines, span, key) {
  const re = new RegExp(`^\\s*${key}\\s*=`);

  for (let i = span.header + 1; i < span.end; i++) {
    if (!re.test(lines[i])) continue;

    let depth = 0;
    for (let j = i; j < span.end; j++) {
      const code = lines[j].replace(/"[^"]*"/g, '').replace(/#.*/, '');
      depth +=
        (code.match(/\[/g) ?? []).length - (code.match(/\]/g) ?? []).length;
      if (depth <= 0) return { start: i, end: j + 1 };
    }
    return { start: i, end: i + 1 };
  }

  return null;
}

/**
 * Reads a key's raw value text from a table.
 *
 * @param text - The config's contents
 * @param section - A table name, or null for the top level
 * @param key - The key
 * @returns The raw value, or null when absent
 */
export function getValue(text, section, key) {
  const lines = text.split('\n');
  const span = tableSpan(lines, section);
  const at = span && keySpan(lines, span, key);
  if (!at) return null;

  return lines
    .slice(at.start, at.end)
    .join('\n')
    .replace(/^[^=]*=\s*/, '');
}

/**
 * Sets a key in a table, adding the key or the table when missing.
 *
 * @param text - The config's contents
 * @param section - A table name, or null for the top level
 * @param key - The key
 * @param value - The raw TOML value to write
 * @param options - `onlyIfPresent` leaves a missing key missing
 * @returns The new contents
 */
export function setKey(
  text,
  section,
  key,
  value,
  { onlyIfPresent = false } = {},
) {
  const lines = text.split('\n');
  const line = `${key} = ${value}`;
  const span = tableSpan(lines, section);

  if (!span) {
    if (onlyIfPresent) return text;

    const child = lines.findIndex((l) =>
      HEADER.exec(l)?.[1].trim().startsWith(`${section}.`),
    );
    if (child !== -1) {
      lines.splice(child, 0, `[${section}]`, line, '');
      return lines.join('\n');
    }

    const gap = text.endsWith('\n') ? '' : '\n';
    return `${text}${gap}\n[${section}]\n${line}\n`;
  }

  const at = keySpan(lines, span, key);
  if (at) {
    lines.splice(at.start, at.end - at.start, line);
  } else if (!onlyIfPresent) {
    lines.splice(span.header + 1, 0, line);
  }

  return lines.join('\n');
}
