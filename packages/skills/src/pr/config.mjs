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
  assertPlainRegex,
  installedPackages,
  isPlainObject,
  isStringList,
  unknownKeys,
} from '../review/config.mjs';
import {
  AGENT_HALF_DEFAULTS,
  BACKEND_SECTION,
  BUILT_IN_DIMENSIONS,
  DEFAULT_BUDGET,
  DEFAULT_EXPERIMENTS,
  DEFAULT_LOCAL_CI,
  DEFAULT_OUTSIDE_REPO,
  DEFAULT_PROMPTS,
  DEFAULT_TESTS,
  DEFAULT_VERIFY,
  HUMAN_SECTION_DEFAULTS,
  SUMMARY_MARKER,
  TOUCHES,
} from './defaults.mjs';

/** The skill's folder and slash command when `skills.json` does not name it. */
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
  'storyMatch',
  'localCi',
  'localCiNote',
  'traps',
  'template',
  'prompts',
  'outsideRepo',
  'budget',
  'experiments',
];
const LAYER_KEYS = ['key', 'title', 'paths', 'section', 'touches'];
const BOOT_KEYS = ['start', 'stop', 'variables', 'read'];
const START_KEYS = ['run', 'when'];
const VARIABLE_KEYS = ['from', 'when', 'backendOnly'];
const QUESTION_KEYS = ['ask', 'paths'];

/** What a variable marked `backendOnly` is needed for. */
const BACKEND_TOUCHES = ['database', 'api'];
// Still accepted so older configs load; the base now always comes from `resolveBase`.
const BASES = ['branch', 'stack'];
const STORY_MATCHES = ['stem', 'imports', 'both'];

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
    when: ['api'],
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
    name: options.name,
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
 * @param context - The skill `name`, the `skillsDir`, the config's `source` path for messages, and the `installed` package names
 * @returns The resolved config
 * @throws When anything in the config is unknown, mistyped or inconsistent
 */
export function resolvePrConfig(
  raw,
  { name = SKILL_NAME, skillsDir, source, installed = new Set() },
) {
  const fail = (message) => {
    throw new Error(`${source}: ${message}`);
  };

  if (!isPlainObject(raw)) fail('must export an object');
  unknownKeys(raw, TOP_KEYS, 'the config', fail);

  const base = raw.base ?? 'branch';
  if (!BASES.includes(base)) fail(`base must be one of ${BASES.join(', ')}`);

  const storyMatch = raw.storyMatch ?? 'both';
  if (!STORY_MATCHES.includes(storyMatch)) {
    fail(`storyMatch must be one of ${STORY_MATCHES.join(', ')}`);
  }

  const sections = resolveSections(raw.sections, fail);
  const layers = resolveLayers(raw.layers, sections, fail);

  for (const key of Object.keys(sections)) {
    if (key !== 'backend' && !layers.some((layer) => layer.section === key)) {
      fail(`section "${key}" has no layer pointing at it`);
    }
  }

  return {
    name,
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
    storyMatch,
    localCi: stringList(raw.localCi, 'localCi', fail) ?? DEFAULT_LOCAL_CI,
    localCiNote: optionalString(raw.localCiNote, 'localCiNote', fail) ?? '',
    traps:
      optionalString(raw.traps, 'traps', fail) ??
      `${skillsDir}/${name}/TRAPS.md`,
    template:
      optionalString(raw.template, 'template', fail) ??
      '.github/pull_request_template.md',
    prompts: resolvePrompts(raw.prompts, fail),
    outsideRepo: resolveOutsideRepo(raw.outsideRepo, fail),
    budget: resolveBudget(raw.budget, fail),
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

    const { agent, ...fields } = value;
    unknownKeys(fields, Object.keys(HUMAN_SECTION_DEFAULTS), where, fail);
    checkStrings(fields, where, fail);
    if (!fields.title) fail(`${where} needs a title`);

    sections[key] = {
      ...HUMAN_SECTION_DEFAULTS,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      ...fields,
      agent: resolveAgentHalf(agent, `${where}.agent`, fail),
    };
  }

  return sections;
}

/**
 * Resolves the agent-runnable half of a human section.
 *
 * @param raw - The section's `agent`, or undefined when it has none
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The half with its defaults, or null when the section is not split
 */
function resolveAgentHalf(raw, where, fail) {
  if (raw === undefined) return null;
  unknownKeys(raw, Object.keys(AGENT_HALF_DEFAULTS), where, fail);
  checkStrings(raw, where, fail);
  if (!raw.title) fail(`${where} needs a title`);
  return { ...AGENT_HALF_DEFAULTS, ...raw };
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
    paths.forEach((p, i) => {
      if (p instanceof RegExp)
        assertPlainRegex(`${where}.paths[${i}]`, p, fail);
    });

    return {
      key: layer.key,
      title: layer.title,
      paths,
      section: layer.section,
      touches:
        layer.touches === undefined
          ? null
          : touchList(layer.touches, `${where}.touches`, fail),
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

  const start = raw.start ?? [];
  if (!Array.isArray(start)) fail('boot.start must be a list');

  return {
    start: start.map((entry, i) => command(entry, `boot.start[${i}]`, fail)),
    stop:
      raw.stop === undefined
        ? { run: '', when: [] }
        : command(raw.stop, 'boot.stop', fail),
    variables: Object.entries(variables).map(([name, value]) => {
      const where = `boot.variables.${name}`;
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
        fail(`${where} must be an upper-case shell variable name`);
      }
      if (typeof value === 'string') return { name, from: value, when: [] };

      unknownKeys(value, VARIABLE_KEYS, where, fail);
      if (typeof value.from !== 'string')
        fail(`${where}.from must be a string`);
      if (value.when !== undefined && value.backendOnly !== undefined) {
        fail(`${where} sets both when and backendOnly; keep when`);
      }

      const when =
        value.when !== undefined
          ? touchList(value.when, `${where}.when`, fail)
          : value.backendOnly
            ? BACKEND_TOUCHES
            : [];
      return { name, from: value.from, when };
    }),
    read: stringList(raw.read, 'boot.read', fail) ?? [],
  };
}

/**
 * Reads a boot command, which runs always or only when the diff needs it.
 *
 * @param entry - A command string, or `{ run, when }`
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The command and what it is `when` needed, empty for always
 */
function command(entry, where, fail) {
  if (typeof entry === 'string') return { run: entry, when: [] };

  if (!isPlainObject(entry)) fail(`${where} must be a string or { run, when }`);
  unknownKeys(entry, START_KEYS, where, fail);
  if (typeof entry.run !== 'string' || !entry.run) {
    fail(`${where}.run must be a string`);
  }
  // Leaving `when` out means always, as it does for a plain string or a variable.
  return {
    run: entry.run,
    when:
      entry.when === undefined
        ? []
        : touchList(entry.when, `${where}.when`, fail),
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
 * Resolves the questions every diff is asked about what it needs outside
 * the repository.
 *
 * @param raw - The config's `outsideRepo`, replacing the defaults whole; `[]` asks none
 * @param fail - Throws with the config's path
 * @returns Each question with the paths that answer it yes by script
 */
function resolveOutsideRepo(raw, fail) {
  if (raw === undefined) return DEFAULT_OUTSIDE_REPO;
  if (!Array.isArray(raw)) fail('outsideRepo must be a list');

  return raw.map((question, i) => {
    const where = `outsideRepo[${i}]`;
    if (!isPlainObject(question)) fail(`${where} must be an object`);
    unknownKeys(question, QUESTION_KEYS, where, fail);
    if (typeof question.ask !== 'string' || !question.ask) {
      fail(`${where}.ask must be a string`);
    }

    const paths = question.paths ?? [];
    if (
      !Array.isArray(paths) ||
      !paths.every((p) => p instanceof RegExp || typeof p === 'string')
    ) {
      fail(`${where}.paths must be a list of regexes or path prefixes`);
    }
    paths.forEach((p, j) => {
      if (p instanceof RegExp)
        assertPlainRegex(`${where}.paths[${j}]`, p, fail);
    });

    return { ask: question.ask, paths };
  });
}

/**
 * Lays the repository's checklist budget over the default one.
 *
 * @param raw - The config's `budget`
 * @param fail - Throws with the config's path
 * @returns The step cap for each kind of diff, and the minutes target
 */
function resolveBudget(raw = {}, fail) {
  if (!isPlainObject(raw)) fail('budget must be an object');
  unknownKeys(raw, Object.keys(DEFAULT_BUDGET), 'budget', fail);

  for (const [key, value] of Object.entries(raw)) {
    if (!Number.isInteger(value) || value < 1) {
      fail(`budget.${key} must be a whole number above 0`);
    }
  }

  return { ...DEFAULT_BUDGET, ...raw };
}

/**
 * Reads a list of what a change can need running.
 *
 * @param value - The raw value
 * @param where - Its location, for the message
 * @param fail - Throws with the config's path
 * @returns The list
 */
function touchList(value, where, fail) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => TOUCHES.includes(item))
  ) {
    fail(`${where} must be a non-empty list of ${TOUCHES.join(', ')}`);
  }
  return [...new Set(value)];
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
 * Reads an optional list of regexes, none with the `g` or `y` flag.
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
  value.forEach((re, i) => assertPlainRegex(`${where}[${i}]`, re, fail));
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
