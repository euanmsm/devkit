// ============================================================================
// Config
// ============================================================================
//
// Reads and validates `.devkit/dead-code.json`: the workspaces, the issue types
// and the known false positives, each with its reason.

import { compile, loadConfig, repoRoot } from '@euanmsm/devkit-core';

/** The config file's name inside `.devkit/`. */
export const CONFIG_NAME = 'dead-code.json';

/** Values used for any key the config leaves out. */
export const DEFAULTS = {
  workspaces: [],
  include: ['files', 'exports', 'types'],
};

const TOP_KEYS = new Set(['workspaces', 'include', 'known']);
const KNOWN_KEYS = new Set(['path', 'names', 'reason']);

/**
 * Tells whether a value is a list of strings.
 *
 * @param value - Anything from the parsed JSON
 * @returns True for an array holding only strings
 */
function isStringList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Throws when an object carries a key outside the allowed set.
 *
 * @param object - The object to check
 * @param allowed - The keys it may carry
 * @param where - Prefix naming the object in the error
 * @throws When a key is neither allowed nor a `_` note
 */
function rejectUnknownKeys(object, allowed, where) {
  for (const key of Object.keys(object))
    if (!allowed.has(key) && !key.startsWith('_'))
      throw new Error(`${where}: unknown key "${key}"`);
}

/**
 * Validates one `known` entry and compiles its path.
 *
 * @param entry - The entry as parsed
 * @param where - Prefix naming the entry in errors
 * @returns `{ path, pattern, names, reason }`, with `names` null when absent
 * @throws When the entry is malformed
 */
function knownEntry(entry, where) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${where} must be an object`);
  rejectUnknownKeys(entry, KNOWN_KEYS, where);

  if (typeof entry.path !== 'string' || entry.path === '')
    throw new Error(`${where}.path is required, as a regex string`);
  const [pattern] = compile([entry.path]);
  if (!pattern) throw new Error(`${where}.path is not a valid regex`);

  if (entry.names !== undefined && !isStringList(entry.names))
    throw new Error(`${where}.names must be a list of strings`);
  if (typeof entry.reason !== 'string' || entry.reason.trim() === '')
    throw new Error(`${where}.reason is required`);

  return {
    path: entry.path,
    pattern,
    names: entry.names ?? null,
    reason: entry.reason,
  };
}

/**
 * Checks a parsed config and fills the defaults.
 *
 * @param raw - The parsed JSON, or null when there is no file
 * @param source - The file's name, used to prefix every error
 * @returns `{ workspaces, include, known }`
 * @throws When a key is unknown, mistyped or missing
 */
export function validate(raw, source) {
  const config = raw ?? {};
  if (typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${source} must hold a JSON object`);
  rejectUnknownKeys(config, TOP_KEYS, source);

  for (const key of ['workspaces', 'include'])
    if (config[key] !== undefined && !isStringList(config[key]))
      throw new Error(`${source}: ${key} must be a list of strings`);
  if (config.known !== undefined && !Array.isArray(config.known))
    throw new Error(`${source}: known must be a list`);

  return {
    workspaces: config.workspaces ?? DEFAULTS.workspaces,
    include: config.include ?? DEFAULTS.include,
    known: (config.known ?? []).map((entry, i) =>
      knownEntry(entry, `${source}: known[${i}]`),
    ),
  };
}

/**
 * Sets the findings a `known` entry covers apart from the rest.
 *
 * @param findings - Findings from knip
 * @param known - The config's validated `known` entries
 * @returns `{ findings, known, stale }`, each known finding carrying its entry's reason
 */
export function applyKnown(findings, known) {
  const kept = [];
  const set = [];
  const hit = new Set();

  for (const finding of findings) {
    const entry = known.find(
      (k) =>
        k.pattern.test(finding.file) &&
        (!k.names || k.names.includes(finding.name)),
    );
    if (!entry) {
      kept.push(finding);
      continue;
    }
    hit.add(entry);
    set.push({ ...finding, reason: entry.reason });
  }

  const stale = known
    .filter((k) => !hit.has(k))
    .map(({ path, names, reason }) => ({
      path,
      ...(names ? { names } : {}),
      reason,
    }));

  return { findings: kept, known: set, stale };
}

/**
 * Reads the repository's config.
 *
 * @param root - The repository root
 * @returns The validated config, defaults filled
 * @throws When the file does not parse or validate
 */
export function readConfig(root = repoRoot()) {
  return validate(
    loadConfig(CONFIG_NAME, null, root),
    `.devkit/${CONFIG_NAME}`,
  );
}
