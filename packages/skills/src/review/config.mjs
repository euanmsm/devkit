// ============================================================================
// Code Review Config
// ============================================================================
//
// Loads a repository's `.devkit/code-review.mjs`, lays it over the built-in
// lenses, bundles and prompt wording, and refuses anything that would leave
// the review quietly doing less than the config says.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BUILT_IN_LENSES,
  BUILT_IN_TOOLS,
  DEFAULT_BUNDLES,
  DEFAULT_FILES,
  DEFAULT_PREPASS,
  DEFAULT_PROMPTS,
  DEFAULT_TOOL_PACKAGES,
} from './defaults.mjs';

const TOP_KEYS = [
  'files',
  'prepass',
  'lenses',
  'bundles',
  'splitOrder',
  'prompts',
  'rosterNotes',
];
const LENS_KEYS = ['skill', 'title', 'route', 'judges', 'diffOnly', 'bundle'];
const ROUTE_KEYS = ['always', 'paths', 'coverage', 'judgment'];
const BUNDLE_KEYS = ['key', 'title', 'scope', 'model', 'lenses', 'split'];
const TOOL_KEYS = [
  'key',
  'label',
  'command',
  'json',
  'appendFiles',
  'onlyFilesUnderReview',
];
const PREPASS_KEYS = ['tools', 'graph', ...Object.keys(BUILT_IN_TOOLS)];
const MODELS = ['opus', 'sonnet', 'haiku'];

// Report names the prepass writes itself, so no tool may take them.
const RESERVED_TOOL_KEYS = ['importGraph', 'sentinel', 'files'];

/**
 * Loads and resolves the review config for a repository.
 *
 * @param root - The repository root
 * @param options - The skill's options from `skills.json`
 * @param shared - The shared settings, for `skillsDir`
 * @returns The resolved config, ready to inline into the workflow
 * @throws When the module fails to load or the config is invalid
 */
export async function loadReviewConfig(root, options, shared) {
  const path = join(root, options.config);
  let raw = {};

  if (existsSync(path)) {
    // The query string defeats the module cache when the file has changed.
    const url = `${pathToFileURL(path).href}?v=${statSync(path).mtimeMs}`;
    raw = (await import(url)).default ?? {};
  }

  const resolved = resolveReviewConfig(raw, {
    name: options.name,
    skillsDir: shared.skillsDir,
    source: options.config,
    installed: installedPackages(root),
  });

  checkSkillsExist(resolved, root);

  return resolved;
}

/**
 * Lays a raw config over the defaults and validates the result.
 *
 * @param raw - The object the repository's module exports
 * @param context - The skill `name`, the `skillsDir`, the config's `source` path for messages, and the `installed` package names
 * @returns The resolved config
 * @throws When anything in the config is unknown, mistyped or inconsistent
 */
export function resolveReviewConfig(
  raw,
  { name, skillsDir, source, installed = new Set() },
) {
  const fail = (message) => {
    throw new Error(`${source}: ${message}`);
  };

  if (!isPlainObject(raw)) fail('must export an object');
  unknownKeys(raw, TOP_KEYS, 'the config', fail);

  const files = resolveFiles(raw.files, fail);
  const prepass = resolvePrepass(raw.prepass, installed, fail);
  const lenses = resolveLenses(raw.lenses, files, fail);
  const bundles = resolveBundles(raw.bundles, raw.lenses, lenses, fail);
  const splitOrder = resolveSplitOrder(raw.splitOrder, bundles, fail);
  const prompts = resolvePrompts(raw.prompts, fail);

  if (raw.rosterNotes !== undefined && typeof raw.rosterNotes !== 'string') {
    fail('rosterNotes must be a string');
  }

  return {
    name,
    skillsDir,
    files,
    prepass,
    lenses,
    bundles,
    splitOrder,
    diffOnlyLenses: Object.keys(lenses).filter((key) => lenses[key].diffOnly),
    coverageLenses: Object.keys(lenses).filter(
      (key) => lenses[key].route.coverage?.length > 0,
    ),
    prompts,
    rosterNotes: raw.rosterNotes ?? '',
  };
}

/**
 * Lists every package the repository and its workspaces depend on.
 *
 * @param root - The repository root
 * @returns Package names from every `dependencies` and `devDependencies`
 */
export function installedPackages(root) {
  const names = new Set();
  const rootManifest = readManifest(join(root, 'package.json'));
  if (!rootManifest) return names;

  const workspaces = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);

  const dirs = workspaces.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [join(root, pattern)];
    const parent = join(root, pattern.slice(0, -2));
    return existsSync(parent)
      ? readdirSync(parent).map((entry) => join(parent, entry))
      : [];
  });

  for (const manifest of [
    rootManifest,
    ...dirs.map((dir) => readManifest(join(dir, 'package.json'))),
  ]) {
    for (const field of ['dependencies', 'devDependencies']) {
      for (const dep of Object.keys(manifest?.[field] ?? {})) names.add(dep);
    }
  }

  return names;
}

/**
 * Reads a `package.json`, or nothing when it is missing or unreadable.
 *
 * @param path - Absolute path to the file
 * @returns The parsed manifest, or null
 */
function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Fails when a lens names a skill the repository does not have.
 *
 * @param resolved - The resolved config
 * @param root - The repository root
 * @throws When a lens's skill has no `SKILL.md` under `skillsDir`
 */
function checkSkillsExist(resolved, root) {
  const missing = Object.entries(resolved.lenses)
    .filter(([, lens]) => lens.skill)
    .filter(
      ([, lens]) =>
        !existsSync(join(root, resolved.skillsDir, lens.skill, 'SKILL.md')),
    )
    .map(([key, lens]) => `${key} → ${resolved.skillsDir}/${lens.skill}`);

  if (missing.length > 0) {
    throw new Error(
      `These lenses name a skill the repository does not have, so the reviewer would work from general knowledge instead:\n${missing
        .map((line) => `  ${line}`)
        .join('\n')}`,
    );
  }
}

/**
 * Resolves the file patterns.
 *
 * @param raw - The repository's `files`, or undefined
 * @param fail - Throws with the config's path prefixed
 * @returns The patterns with defaults filled in
 */
function resolveFiles(raw = {}, fail) {
  unknownKeys(raw, Object.keys(DEFAULT_FILES), 'files', fail);
  const files = { ...DEFAULT_FILES, ...raw };

  for (const key of ['code', 'docs', 'tests']) {
    if (!(files[key] instanceof RegExp)) fail(`files.${key} must be a RegExp`);
    assertPlainRegex(`files.${key}`, files[key], fail);
  }
  if (!isStringList(files.targetExtensions)) {
    fail('files.targetExtensions must be a list of strings');
  }

  return files;
}

/**
 * Resolves the prepass tools, adding each built-in check the repository has installed.
 *
 * @param raw - The repository's `prepass`, or undefined
 * @param installed - The package names the repository depends on
 * @param fail - Throws with the config's path prefixed
 * @returns The tool list and graph settings
 */
function resolvePrepass(raw = {}, installed, fail) {
  unknownKeys(raw, PREPASS_KEYS, 'prepass', fail);

  const listed =
    raw.tools ??
    DEFAULT_PREPASS.tools.filter((tool) => {
      const needs = DEFAULT_TOOL_PACKAGES[tool.key];
      return !needs || installed.has(needs);
    });
  if (!Array.isArray(listed)) fail('prepass.tools must be a list');

  // A listed tool sharing a built-in's key keeps the built-in's behaviour.
  const tools = listed.map((tool) =>
    BUILT_IN_TOOLS[tool?.key]
      ? { ...BUILT_IN_TOOLS[tool.key].tool, ...tool }
      : tool,
  );

  for (const [key, builtIn] of Object.entries(BUILT_IN_TOOLS)) {
    const setting = raw[key] ?? DEFAULT_PREPASS[key];
    if (setting !== 'auto' && typeof setting !== 'boolean') {
      fail(`prepass.${key} must be "auto", true or false`);
    }

    const index = tools.findIndex((tool) => tool?.key === key);
    const wanted =
      setting === true ||
      (setting === 'auto' && (index !== -1 || installed.has(builtIn.package)));

    if (!wanted && index !== -1) tools.splice(index, 1);
    if (wanted && index === -1) tools.push({ ...builtIn.tool });
  }

  const seen = new Set();
  for (const tool of tools) {
    unknownKeys(tool, TOOL_KEYS, 'a prepass tool', fail);
    if (!/^[A-Za-z][\w-]*$/.test(tool.key ?? '')) {
      fail(`prepass tool key "${tool.key}" must be a plain identifier`);
    }
    if (RESERVED_TOOL_KEYS.includes(tool.key) || seen.has(tool.key)) {
      fail(`prepass tool key "${tool.key}" is taken`);
    }
    if (typeof tool.label !== 'string' || typeof tool.command !== 'string') {
      fail(`prepass tool "${tool.key}" needs a label and a command`);
    }
    seen.add(tool.key);
  }

  unknownKeys(
    raw.graph ?? {},
    Object.keys(DEFAULT_PREPASS.graph),
    'prepass.graph',
    fail,
  );
  const graph = { ...DEFAULT_PREPASS.graph, ...raw.graph };
  if (!(graph.sources instanceof RegExp)) {
    fail('prepass.graph.sources must be a RegExp');
  }
  assertPlainRegex('prepass.graph.sources', graph.sources, fail);
  if (!isStringList(graph.searchGlobs)) {
    fail('prepass.graph.searchGlobs must be a list of strings');
  }

  return {
    tools: tools.map((tool) => ({
      json: false,
      appendFiles: false,
      onlyFilesUnderReview: false,
      ...tool,
    })),
    graph,
  };
}

/**
 * Lays the repository's lenses over the built-ins.
 *
 * @param raw - The repository's `lenses`, or undefined
 * @param files - The resolved file patterns, for the `code` and `tests` shorthands
 * @param fail - Throws with the config's path prefixed
 * @returns Every lens by key, with its route patterns resolved
 */
function resolveLenses(raw = {}, files, fail) {
  const builtIns = structuredClone(BUILT_IN_LENSES);
  const lenses = {};

  // The repository's own order first, so its lists read the way it wrote them.
  for (const [key, entry] of Object.entries(raw)) {
    if (entry === false) {
      if (!builtIns[key]) fail(`lens "${key}" is not a built-in to remove`);
      delete builtIns[key];
      continue;
    }

    if (!isPlainObject(entry)) fail(`lens "${key}" must be an object or false`);
    unknownKeys(entry, LENS_KEYS, `lens "${key}"`, fail);

    const { bundle: _, ...fields } = entry;
    lenses[key] = { ...(builtIns[key] ?? {}), ...fields };
    delete builtIns[key];
  }

  Object.assign(lenses, builtIns);

  for (const [key, lens] of Object.entries(lenses)) {
    if (typeof lens.judges !== 'string') {
      fail(`lens "${key}" needs a judges string`);
    }
    lens.skill ??= null;
    if (lens.skill !== null && typeof lens.skill !== 'string') {
      fail(`lens "${key}" skill must be a string or null`);
    }
    lens.route = resolveRoute(key, lens.route ?? {}, files, fail);
    if (lens.title === undefined) delete lens.title;
    if (!lens.diffOnly) delete lens.diffOnly;
  }

  return lenses;
}

/**
 * Validates a lens route and swaps the `code` and `tests` shorthands for their patterns.
 *
 * @param key - The lens key, for messages
 * @param route - The lens's route
 * @param files - The resolved file patterns
 * @param fail - Throws with the config's path prefixed
 * @returns The resolved route
 */
function resolveRoute(key, route, files, fail) {
  unknownKeys(route, ROUTE_KEYS, `lens "${key}" route`, fail);

  if (
    route.always !== undefined &&
    route.always !== 'code' &&
    route.always !== 'codeOrDocs'
  ) {
    fail(`lens "${key}" route.always must be "code" or "codeOrDocs"`);
  }
  if (route.judgment !== undefined && typeof route.judgment !== 'string') {
    fail(`lens "${key}" route.judgment must be a sentence for Recon`);
  }

  const patterns = (list, field) => {
    if (list === undefined) return undefined;
    if (!Array.isArray(list))
      fail(`lens "${key}" route.${field} must be a list`);

    return list.map((item) => {
      if (item === 'code') return files.code;
      if (item === 'tests') return files.tests;
      if (item instanceof RegExp) {
        assertPlainRegex(`lens "${key}" route.${field}`, item, fail);
        return item;
      }
      fail(`lens "${key}" route.${field} holds something that is not a RegExp`);
    });
  };

  const resolved = { ...route };
  const paths = patterns(route.paths, 'paths');
  const coverage = patterns(route.coverage, 'coverage');
  if (paths) resolved.paths = paths;
  if (coverage) resolved.coverage = coverage;

  // Recon is shown only lenses with a judgment, so nothing else could switch this one on.
  if (
    !resolved.always &&
    !resolved.paths?.length &&
    !resolved.coverage?.length &&
    !resolved.judgment
  ) {
    fail(
      `lens "${key}" route never fires. Give it always, a non-empty paths or coverage, or a judgment`,
    );
  }

  return resolved;
}

/**
 * Resolves the bundle list and checks every lens sits in exactly one bundle.
 *
 * @param raw - The repository's `bundles`, or undefined for the defaults
 * @param rawLenses - The repository's lens entries, for their `bundle` fields
 * @param lenses - The resolved lenses
 * @param fail - Throws with the config's path prefixed
 * @returns The bundles
 */
function resolveBundles(raw, rawLenses = {}, lenses, fail) {
  let bundles = structuredClone(raw ?? DEFAULT_BUNDLES);
  if (!Array.isArray(bundles)) fail('bundles must be a list');

  // The defaults may name a built-in the repository removed.
  if (!raw) {
    bundles = bundles
      .map((bundle) => ({
        ...bundle,
        lenses: bundle.lenses.filter((lens) => lenses[lens]),
        split: bundle.split
          ?.map((part) => ({
            ...part,
            lenses: part.lenses.filter((lens) => lenses[lens]),
          }))
          .filter((part) => part.lenses.length > 0),
      }))
      .filter((bundle) => bundle.lenses.length > 0);
  }

  for (const bundle of bundles) {
    unknownKeys(bundle, BUNDLE_KEYS, `bundle "${bundle.key}"`, fail);
    if (typeof bundle.key !== 'string') fail('every bundle needs a key');
    if (bundle.scope !== 'target' && bundle.scope !== 'slice') {
      fail(`bundle "${bundle.key}" scope must be "target" or "slice"`);
    }
    if (!MODELS.includes(bundle.model)) {
      fail(`bundle "${bundle.key}" model must be one of ${MODELS.join(', ')}`);
    }
    if (!isStringList(bundle.lenses)) {
      fail(`bundle "${bundle.key}" lenses must be a list of lens keys`);
    }
    if (bundle.split !== undefined && !Array.isArray(bundle.split)) {
      fail(
        `bundle "${bundle.key}" split must be a list of { lenses, model } parts`,
      );
    }
    for (const part of bundle.split ?? []) {
      if (!isPlainObject(part) || !isStringList(part.lenses)) {
        fail(`a split part of "${bundle.key}" needs a list of lenses`);
      }
    }
    if (bundle.split?.length < 2) delete bundle.split;
  }

  const byKey = new Map(bundles.map((bundle) => [bundle.key, bundle]));

  for (const [key, entry] of Object.entries(rawLenses)) {
    if (!entry?.bundle) continue;

    const bundle = byKey.get(entry.bundle);
    if (!bundle)
      fail(
        `lens "${key}" names bundle "${entry.bundle}", which does not exist`,
      );
    if (!bundle.lenses.includes(key)) bundle.lenses.push(key);
    if (
      bundle.split &&
      !bundle.split.some((part) => part.lenses.includes(key))
    ) {
      bundle.split[0].lenses.push(key);
    }
  }

  const home = new Map();

  for (const bundle of bundles) {
    for (const lens of bundle.lenses) {
      if (!lenses[lens])
        fail(`bundle "${bundle.key}" names unknown lens "${lens}"`);
      if (home.has(lens)) {
        fail(
          `lens "${lens}" is in both "${home.get(lens)}" and "${bundle.key}"`,
        );
      }
      home.set(lens, bundle.key);
    }

    if (bundle.split) checkSplit(bundle, fail);
  }

  for (const lens of Object.keys(lenses)) {
    if (!home.has(lens)) {
      fail(
        `lens "${lens}" sits in no bundle. Add it to one, set its bundle field, or remove it with false`,
      );
    }
  }

  return bundles;
}

/**
 * Fails unless a bundle's split parts each have a model and together name exactly its lenses, each once.
 *
 * @param bundle - A bundle with a `split`
 * @param fail - Throws with the config's path prefixed
 */
function checkSplit(bundle, fail) {
  const placed = new Set();

  for (const part of bundle.split) {
    if (!MODELS.includes(part.model)) {
      fail(`a split part of "${bundle.key}" needs a model`);
    }
    for (const lens of part.lenses) {
      if (!bundle.lenses.includes(lens)) {
        fail(
          `bundle "${bundle.key}" split names "${lens}", which is not in the bundle`,
        );
      }
      if (placed.has(lens)) {
        fail(`the split of "${bundle.key}" names "${lens}" in two parts`);
      }
      placed.add(lens);
    }
  }

  // A lens in no part would stop running whenever the bundle splits.
  for (const lens of bundle.lenses) {
    if (!placed.has(lens)) {
      fail(
        `the split of "${bundle.key}" leaves out "${lens}". Every lens in the bundle must be in one part`,
      );
    }
  }
}

/**
 * Resolves the order fat bundles are split in.
 *
 * @param raw - The repository's `splitOrder`, or undefined
 * @param bundles - The resolved bundles
 * @param fail - Throws with the config's path prefixed
 * @returns Bundle keys, each naming a bundle with a split
 */
function resolveSplitOrder(raw, bundles, fail) {
  const splittable = bundles.filter((bundle) => bundle.split);
  if (raw === undefined) return splittable.map((bundle) => bundle.key);

  if (!isStringList(raw)) fail('splitOrder must be a list of bundle keys');
  for (const key of raw) {
    if (!splittable.some((bundle) => bundle.key === key)) {
      fail(`splitOrder names "${key}", which is not a bundle with a split`);
    }
  }

  return raw;
}

/**
 * Lays the repository's prompt wording over the defaults.
 *
 * @param raw - The repository's `prompts`, or undefined
 * @param fail - Throws with the config's path prefixed
 * @returns Every prompt slot filled
 */
function resolvePrompts(raw = {}, fail) {
  unknownKeys(raw, Object.keys(DEFAULT_PROMPTS), 'prompts', fail);
  const prompts = { ...DEFAULT_PROMPTS, ...raw };

  for (const [key, value] of Object.entries(prompts)) {
    const ok =
      key === 'extraReadingSteps'
        ? isStringList(value)
        : typeof value === 'string';
    if (!ok) fail(`prompts.${key} has the wrong type`);
  }

  return prompts;
}

/**
 * Fails on a regex whose `g` or `y` flag would carry `lastIndex` from one `.test()` call to the next.
 *
 * @param key - The config key holding the regex, for the message
 * @param re - The regex
 * @param fail - Throws with the config's path prefixed
 */
export function assertPlainRegex(key, re, fail) {
  if (re.global || re.sticky) {
    fail(
      `${key} must not use the g or y flag, which makes repeated matches skip files. Use ${new RegExp(re.source, re.flags.replace(/[gy]/g, ''))}`,
    );
  }
}

/**
 * Fails on any key outside the allowed list.
 *
 * @param object - The object to check
 * @param allowed - The keys it may carry
 * @param where - What the object is, for the message
 * @param fail - Throws with the config's path prefixed
 */
export function unknownKeys(object, allowed, where, fail) {
  if (!isPlainObject(object)) fail(`${where} must be an object`);

  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      fail(`unknown key "${key}" in ${where}. Allowed: ${allowed.join(', ')}`);
    }
  }
}

/**
 * Tells whether a value is a plain object.
 *
 * @param value - Anything
 * @returns Whether it is a non-null, non-array object
 */
export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof RegExp)
  );
}

/**
 * Tells whether a value is a list of strings.
 *
 * @param value - Anything
 * @returns Whether it is an array holding only strings
 */
export function isStringList(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}
