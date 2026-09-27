// ============================================================================
// PR Skill Config
// ============================================================================
//
// Loads a repository's `.devkit/pr.mjs`, lays it over the built-in sections,
// dimensions and prompt wording, and refuses anything that would leave the
// checklist quietly covering less than the config says.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  installedPackages,
  isPlainObject,
  isStringList,
  unknownKeys,
} from '../review/config.mjs';
import {
  BACKEND_SECTION,
  BUILT_IN_DIMENSIONS,
  DEFAULT_EXPERIMENTS,
  DEFAULT_LOCAL_CI,
  DEFAULT_PROMPTS,
  DEFAULT_TESTS,
  DEFAULT_VERIFY,
  HUMAN_SECTION_DEFAULTS,
  SUMMARY_MARKER,
} from './defaults.mjs';

/** The skill's folder and slash command, the same in every repository. */
export const SKILL_NAME = 'pr';

const TOP_KEYS = [
  'base',
  'layers',
  'sections',
  'actors',
  'dimensions',
  'verify',
  'boot',
  'tests',
  'storybook',
  'localCi',
  'localCiNote',
  'traps',
  'template',
  'prompts',
  'experiments',
];
const LAYER_KEYS = ['key', 'title', 'paths', 'section'];
const BOOT_KEYS = ['start', 'stop', 'variables', 'read'];
const VARIABLE_KEYS = ['from', 'backendOnly'];
const BASES = ['branch', 'stack'];

/** Who acts in the system, when a repository does not say. */
const DEFAULT_ACTORS = [
  'a signed-in user',
  'an admin',
  'an API caller',
  'a background job',
];

/** The boot variables every checklist can derive, when a repository does not say. */
const DEFAULT_VARIABLES = {
  PORT: 'the port the app serves on locally',
  TOKEN: {
    from: 'a bearer token for a seeded account',
    backendOnly: true,
  },
};

/**
 * Loads and resolves the PR config for a repository.
 *
 * @param root - The repository root
 * @param options - The skill's options from `skills.json`
 * @param shared - The shared settings, for `skillsDir`
 * @returns The resolved config, ready to inline into the workflow
 * @throws When the module fails to load, the config is invalid, or the PR template is unusable
 */
export async function loadPrConfig(root, options, shared) {
  const path = join(root, options.config);
  let raw = {};

  if (existsSync(path)) {
    // The query string defeats the module cache when the file has changed.
    const url = `${pathToFileURL(path).href}?v=${statSync(path).mtimeMs}`;
    raw = (await import(url)).default ?? {};
  }

  const resolved = resolvePrConfig(raw, {
    skillsDir: shared.skillsDir,
    source: options.config,
    installed: installedPackages(root),
  });

  checkTemplate(resolved, root);

  return resolved;
}

/**
 * Lays a raw config over the defaults and validates the result.
 *
 * @param raw - The object the repository's module exports
 * @param context - The `skillsDir`, the config's `source` path for messages, and the `installed` package names
 * @returns The resolved config
 * @throws When anything in the config is unknown, mistyped or inconsistent
 */
export function resolvePrConfig(
  raw,
  { skillsDir, source, installed = new Set() },
) {
  const fail = (message) => {
    throw new Error(`${source}: ${message}`);
  };

  if (!isPlainObject(raw)) fail('must export an object');
  unknownKeys(raw, TOP_KEYS, 'the config', fail);

  const base = raw.base ?? 'branch';
  if (!BASES.includes(base)) fail(`base must be one of ${BASES.join(', ')}`);

  const sections = resolveSections(raw.sections, fail);
  const layers = resolveLayers(raw.layers, sections, fail);

  for (const key of Object.keys(sections)) {
    if (key !== 'backend' && !layers.some((layer) => layer.section === key)) {
      fail(`section "${key}" has no layer pointing at it`);
    }
  }

  return {
    name: SKILL_NAME,
    skillsDir,
    base,
    layers,
    sections,
    actors: stringList(raw.actors, 'actors', fail) ?? DEFAULT_ACTORS,
    dimensions: resolveDimensions(raw.dimensions, fail),
    verify: resolveVerify(raw.verify, fail),
    boot: resolveBoot(raw.boot, fail),
    tests: regexList(raw.tests, 'tests', fail) ?? DEFAULT_TESTS,
    storybook: resolveStorybook(raw.storybook, installed, fail),
    localCi: stringList(raw.localCi, 'localCi', fail) ?? DEFAULT_LOCAL_CI,
    localCiNote: optionalString(raw.localCiNote, 'localCiNote', fail) ?? '',
    traps:
      optionalString(raw.traps, 'traps', fail) ??
      `${skillsDir}/${SKILL_NAME}/TRAPS.md`,
    template:
      optionalString(raw.template, 'template', fail) ??
      '.github/pull_request_template.md',
    prompts: resolvePrompts(raw.prompts, fail),
    experiments: resolveExperiments(raw.experiments, fail),
  };
}

/**
 * Fails when the PR template is missing or has nowhere for the summary to go.
 *
 * @param resolved - The resolved config
 * @param root - The repository root
 * @throws When the template file is missing or lacks the summary marker
 */
function checkTemplate(resolved, root) {
  const path = join(root, resolved.template);

  if (!existsSync(path)) {
    throw new Error(
      `The PR template ${resolved.template} does not exist. Create it with a ${SUMMARY_MARKER} line where the summary goes, or point "template" in the PR config at yours.`,
    );
  }
  if (!readFileSync(path, 'utf8').includes(SUMMARY_MARKER)) {
    throw new Error(
      `The PR template ${resolved.template} has no ${SUMMARY_MARKER} line, so the summary has nowhere to go.`,
    );
  }
}

/**
 * Resolves the backend section and the repository's human sections.
 *
 * @param raw - The config's `sections`
 * @param fail - Throws with the config's path
 * @returns Every section by key, `backend` first
 */
function resolveSections(raw = {}, fail) {
  if (!isPlainObject(raw)) fail('sections must be an object');

  const sections = { backend: { ...BACKEND_SECTION } };

  for (const [key, value] of Object.entries(raw)) {
    const where = `sections.${key}`;

    if (key === 'backend') {
      unknownKeys(value, Object.keys(BACKEND_SECTION), where, fail);
      checkStrings(value, where, fail);
      Object.assign(sections.backend, value);
      continue;
    }

    unknownKeys(value, Object.keys(HUMAN_SECTION_DEFAULTS), where, fail);
    checkStrings(value, where, fail);
    if (!value.title) fail(`${where} needs a title`);

    sections[key] = {
      ...HUMAN_SECTION_DEFAULTS,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      ...value,
    };
  }

  return sections;
}

/**
 * Resolves the layers changed paths are sorted into.
 *
 * @param raw - The config's `layers`
 * @param sections - The resolved sections
 * @param fail - Throws with the config's path
 * @returns The layers in the config's order
 */
function resolveLayers(raw, sections, fail) {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('layers must be a non-empty list');
  }

  const seen = new Set();

  return raw.map((layer, i) => {
    const where = `layers[${i}]`;
    unknownKeys(layer, LAYER_KEYS, where, fail);

    for (const key of ['key', 'title', 'section']) {
      if (typeof layer[key] !== 'string' || !layer[key]) {
        fail(`${where}.${key} must be a string`);
      }
    }
    if (seen.has(layer.key)) fail(`two layers use the key "${layer.key}"`);
    seen.add(layer.key);

    if (!sections[layer.section]) {
      fail(
        `${where} points at section "${layer.section}", which does not exist. Sections: ${Object.keys(sections).join(', ')}`,
      );
    }

    const paths = layer.paths;
    if (
      !Array.isArray(paths) ||
      paths.length === 0 ||
      !paths.every((p) => p instanceof RegExp || typeof p === 'string')
    ) {
      fail(
        `${where}.paths must be a non-empty list of regexes or path prefixes`,
      );
    }

    return {
      key: layer.key,
      title: layer.title,
      paths,
      section: layer.section,
    };
  });
}

/**
 * Lays the repository's dimensions over the built-in ones.
 *
 * @param raw - The config's `dimensions`; `false` removes a built-in
 * @param fail - Throws with the config's path
 * @returns Each dimension's question by name
 */
function resolveDimensions(raw = {}, fail) {
  if (!isPlainObject(raw)) fail('dimensions must be an object');

  const dimensions = { ...BUILT_IN_DIMENSIONS };

  for (const [name, text] of Object.entries(raw)) {
    if (text === false) {
      if (!(name in dimensions)) {
        fail(
          `dimensions.${name} is false, but there is no built-in of that name`,
        );
      }
      delete dimensions[name];
    } else if (typeof text === 'string' && text) {
      dimensions[name] = text;
    } else {
      fail(
        `dimensions.${name} must be a string, or false to remove a built-in`,
      );
    }
  }

  return dimensions;
}

/**
 * Adds the repository's entries to the verifier's built-in lists.
 *
 * @param raw - The config's `verify`
 * @param fail - Throws with the config's path
 * @returns Each list, built-ins first
 */
function resolveVerify(raw = {}, fail) {
  unknownKeys(raw, Object.keys(DEFAULT_VERIFY), 'verify', fail);

  const verify = {};

  for (const [key, defaults] of Object.entries(DEFAULT_VERIFY)) {
    const extra = stringList(raw[key], `verify.${key}`, fail) ?? [];
    verify[key] = [...new Set([...defaults, ...extra])];
  }

  return verify;
}

/**
 * Resolves how the checklist's boot block starts and stops the stack.
 *
 * @param raw - The config's `boot`
 * @param fail - Throws with the config's path
 * @returns The start commands, stop command, variables and files to read
 */
function resolveBoot(raw = {}, fail) {
  unknownKeys(raw, BOOT_KEYS, 'boot', fail);

  const variables = raw.variables ?? DEFAULT_VARIABLES;
  if (!isPlainObject(variables)) fail('boot.variables must be an object');

  return {
    start: stringList(raw.start, 'boot.start', fail) ?? [],
    stop: optionalString(raw.stop, 'boot.stop', fail) ?? '',
    variables: Object.entries(variables).map(([name, value]) => {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
        fail(
          `boot.variables.${name} must be an upper-case shell variable name`,
        );
      }
      if (typeof value === 'string') {
        return { name, from: value, backendOnly: false };
      }

      unknownKeys(value, VARIABLE_KEYS, `boot.variables.${name}`, fail);
      if (typeof value.from !== 'string') {
        fail(`boot.variables.${name}.from must be a string`);
      }
      return {
        name,
        from: value.from,
        backendOnly: Boolean(value.backendOnly),
      };
    }),
    read: stringList(raw.read, 'boot.read', fail) ?? [],
  };
}

/**
 * Decides whether the Storybook section runs.
 *
 * @param raw - `true`, `false`, or `'auto'` to follow the installed packages
 * @param installed - Package names the repository depends on
 * @param fail - Throws with the config's path
 * @returns Whether Storybook items are drafted
 */
function resolveStorybook(raw = 'auto', installed, fail) {
  if (raw === true || raw === false) return raw;
  if (raw !== 'auto') fail("storybook must be true, false or 'auto'");

  return [...installed].some(
    (name) => name === 'storybook' || name.startsWith('@storybook/'),
  );
}

/**
 * Lays the repository's wording over the default prompt passages.
 *
 * @param raw - The config's `prompts`
 * @param fail - Throws with the config's path
 * @returns Every prompt passage
 */
function resolvePrompts(raw = {}, fail) {
  unknownKeys(raw, Object.keys(DEFAULT_PROMPTS), 'prompts', fail);

  for (const [key, value] of Object.entries(raw)) {
    const valid = Array.isArray(DEFAULT_PROMPTS[key])
      ? isStringList(value)
      : typeof value === 'string';
    if (!valid) {
      fail(
        `prompts.${key} must be ${Array.isArray(DEFAULT_PROMPTS[key]) ? 'a list of strings' : 'a string'}`,
      );
    }
  }

  return { ...DEFAULT_PROMPTS, ...raw };
}

/**
 * Resolves which experiments are switched on.
 *
 * @param raw - The config's `experiments`
 * @param fail - Throws with the config's path
 * @returns Every experiment's switch
 */
function resolveExperiments(raw = {}, fail) {
  unknownKeys(raw, Object.keys(DEFAULT_EXPERIMENTS), 'experiments', fail);

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean')
      fail(`experiments.${key} must be true or false`);
  }

  return { ...DEFAULT_EXPERIMENTS, ...raw };
}

/**
 * Fails when any value in an object is not a string.
 *
 * @param object - The object to check
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 */
function checkStrings(object, where, fail) {
  for (const [key, value] of Object.entries(object)) {
    if (typeof value !== 'string') fail(`${where}.${key} must be a string`);
  }
}

/**
 * Reads an optional list of strings.
 *
 * @param value - The raw value
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The list, or undefined when unset
 */
function stringList(value, where, fail) {
  if (value === undefined) return undefined;
  if (!isStringList(value)) fail(`${where} must be a list of strings`);
  return value;
}

/**
 * Reads an optional list of regexes.
 *
 * @param value - The raw value
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The list, or undefined when unset
 */
function regexList(value, where, fail) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => item instanceof RegExp)
  ) {
    fail(`${where} must be a non-empty list of regexes`);
  }
  return value;
}

/**
 * Reads an optional string.
 *
 * @param value - The raw value
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The string, or undefined when unset
 */
function optionalString(value, where, fail) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail(`${where} must be a string`);
  return value;
}
