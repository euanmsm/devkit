// ============================================================================
// Config
// ============================================================================
//
// Reads `.devkit/wt.json` and the personal `.devkit/wt.local.json` over it,
// fills in defaults and rejects a config whose shape is wrong.

import { basename, resolve } from 'node:path';
import { loadConfig } from '@euanmsm/devkit-core';

/** The tracked config file's name inside `.devkit/`. */
export const CONFIG_NAME = 'wt.json';

/** The personal, untracked config file's name inside `.devkit/`. */
export const LOCAL_NAME = 'wt.local.json';

const OPEN_MODES = ['window', 'workspace', 'none'];

const DEFAULTS = {
  dir: '../{repo}-wt',
  remote: 'origin',
  env: { copy: ['.env*'], maxDepth: 3 },
  ports: { step: 100, services: {}, offsetEnv: null, killOnDelete: [] },
  hooks: { postCreate: [], preDelete: [] },
  open: 'window',
  workspaceFile: null,
  supabase: null,
};

const SUPABASE_DEFAULTS = {
  dir: 'supabase',
  basePort: 54320,
  step: 1000,
  link: ['migrations', 'seed.sql', 'functions'],
  appService: null,
  resetCommand: null,
  envFiles: [],
};

// ============================================================================
// Loading
// ============================================================================

/**
 * Loads the merged, checked config for a checkout.
 *
 * @param root - The checkout whose tracked `.devkit/wt.json` applies
 * @param main - The main checkout, which holds the untracked local file
 * @returns The config with every default filled in
 * @throws When either file does not parse or the result has the wrong shape
 */
export function loadWtConfig(root, main = root) {
  const shared = loadConfig(CONFIG_NAME, {}, root) ?? {};
  const local = loadConfig(LOCAL_NAME, {}, main) ?? {};
  const config = merge(shared, local);

  const problems = validate(config, { ...shared, ...local });
  if (problems.length > 0) {
    throw new Error(
      `.devkit/${CONFIG_NAME} is not usable:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  return config;
}

/**
 * Layers the shared and local files over the defaults, one section at a time.
 *
 * @param shared - The tracked config
 * @param local - The personal config
 * @returns The merged config
 */
export function merge(shared, local) {
  const pick = (key) => ({
    ...DEFAULTS[key],
    ...(shared[key] ?? {}),
    ...(local[key] ?? {}),
  });
  const supabase = local.supabase ?? shared.supabase;

  return {
    ...DEFAULTS,
    ...strip(shared),
    ...strip(local),
    env: pick('env'),
    ports: pick('ports'),
    hooks: pick('hooks'),
    supabase: supabase
      ? {
          ...SUPABASE_DEFAULTS,
          ...(shared.supabase ?? {}),
          ...(local.supabase ?? {}),
        }
      : null,
  };
}

/**
 * Resolves the folder every worktree of this repository lives in.
 *
 * @param config - The loaded config
 * @param main - The main checkout's root
 * @returns The absolute worktrees folder
 */
export function worktreesDir(config, main) {
  return resolve(main, config.dir.replaceAll('{repo}', basename(main)));
}

/**
 * Resolves the workspace file from the main checkout.
 *
 * @param config - The loaded config
 * @param main - The main checkout's root
 * @returns The absolute workspace file path, or null when none is set
 */
export function workspacePath(config, main) {
  return config.workspaceFile ? resolve(main, config.workspaceFile) : null;
}

// ============================================================================
// Checking
// ============================================================================

/**
 * Drops `_`-prefixed note keys, such as the example file's `_readme`.
 *
 * @param obj - A raw config object
 * @returns The object without note keys
 */
function strip(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !key.startsWith('_')),
  );
}

/**
 * True for a whole number inside the TCP port range.
 *
 * @param value - Any value
 * @returns Whether it is a usable port
 */
function isPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * True for an array holding only strings.
 *
 * @param value - Any value
 * @returns Whether it is a string list
 */
function isStrings(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * True for a hook list of command strings or `{ run, optional }` objects.
 *
 * @param value - Any value
 * @returns Whether it is a usable hook list
 */
function isHooks(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (h) =>
        typeof h === 'string' ||
        (typeof h?.run === 'string' &&
          ['boolean', 'undefined'].includes(typeof h.optional)),
    )
  );
}

/**
 * Lists everything wrong with a merged config.
 *
 * @param config - The merged config
 * @param raw - The two files spread together, for spotting unknown keys
 * @returns One message per problem, empty when the config is usable
 */
export function validate(config, raw = {}) {
  const problems = [];
  const bad = (field, want) => problems.push(`"${field}" must be ${want}`);

  for (const key of Object.keys(strip(raw))) {
    if (!(key in DEFAULTS)) problems.push(`"${key}" is not a known setting`);
  }

  if (typeof config.dir !== 'string' || !config.dir) bad('dir', 'a path');
  if (typeof config.remote !== 'string') bad('remote', 'a remote name');
  if (!OPEN_MODES.includes(config.open)) {
    bad('open', `one of ${OPEN_MODES.join(', ')}`);
  }
  if (
    config.workspaceFile !== null &&
    typeof config.workspaceFile !== 'string'
  ) {
    bad('workspaceFile', 'a path or null');
  }
  if (config.open === 'workspace' && !config.workspaceFile) {
    bad('workspaceFile', 'set when "open" is "workspace"');
  }

  if (!isStrings(config.env.copy)) bad('env.copy', 'a list of file patterns');
  if (!Number.isInteger(config.env.maxDepth) || config.env.maxDepth < 1) {
    bad('env.maxDepth', 'a whole number of at least 1');
  }

  const { ports } = config;
  if (!Number.isInteger(ports.step) || ports.step < 1) {
    bad('ports.step', 'a whole number of at least 1');
  }
  if (typeof ports.services !== 'object' || ports.services === null) {
    bad('ports.services', 'an object of service name to port');
  } else {
    for (const [name, port] of Object.entries(ports.services)) {
      if (!isPort(port)) bad(`ports.services.${name}`, 'a port number');
    }
  }
  if (!isStrings(ports.killOnDelete)) {
    bad('ports.killOnDelete', 'a list of service names');
  } else {
    for (const name of ports.killOnDelete) {
      if (!(name in (ports.services ?? {}))) {
        bad(`ports.killOnDelete`, `names from ports.services, not "${name}"`);
      }
    }
  }
  if (ports.offsetEnv !== null) {
    const env = ports.offsetEnv;
    if (typeof env?.name !== 'string' || !isStrings(env?.files)) {
      bad('ports.offsetEnv', 'null or { "name": string, "files": [paths] }');
    }
  }

  for (const hook of ['postCreate', 'preDelete']) {
    if (!isHooks(config.hooks[hook])) {
      bad(
        `hooks.${hook}`,
        'a list of commands or { "run", "optional" } objects',
      );
    }
  }

  if (config.supabase) problems.push(...validateSupabase(config));

  return problems;
}

/**
 * Lists everything wrong with the `supabase` block.
 *
 * @param config - The merged config, with a `supabase` block
 * @returns One message per problem
 */
function validateSupabase(config) {
  const problems = [];
  const sb = config.supabase;
  const bad = (field, want) =>
    problems.push(`"supabase.${field}" must be ${want}`);

  if (typeof sb.dir !== 'string' || basename(sb.dir) !== 'supabase') {
    bad('dir', 'a path ending in a folder named "supabase"');
  }
  if (!isPort(sb.basePort)) bad('basePort', 'a port number');
  if (!Number.isInteger(sb.step) || sb.step < 10) {
    bad('step', 'a whole number of at least 10');
  }
  if (!isStrings(sb.link))
    bad('link', 'a list of names inside the supabase folder');
  if (sb.appService !== null && !(sb.appService in config.ports.services)) {
    bad('appService', 'null or a name from ports.services');
  }
  if (sb.resetCommand !== null && typeof sb.resetCommand !== 'string') {
    bad('resetCommand', 'null or a command');
  }
  if (!isStrings(sb.envFiles)) bad('envFiles', 'a list of paths');

  return problems;
}
